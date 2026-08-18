import { prisma } from '../utils/prismaClient.js'
import { auditCreate, auditDelete } from '../utils/audit.js'
import { getPriceMap } from './priceController.js'
import {
  isSpecialMarket, findDepoMarket, findDiscardMarket, DISCARD_NO, DEPO_NO,
} from '../utils/markets.js'
import { trackedCases } from '../utils/cases.js'
import { isCountable, normalizeUnit, unitLabel } from '../utils/units.js'
import { priceOf } from '../utils/prices.js'
import { toPriceDate, startOfLocalDay, endOfLocalDay } from '../utils/date.js'
import { parsePagination, paginated } from '../utils/pagination.js'

// errorHandler err.status'ü okur — transaction içinden anlamlı HTTP kodu fırlatmak için
function httpError(status, message) {
  const e = new Error(message)
  e.status = status
  return e
}

// Depodaki bekleyen girişleri listele (çıkış kesilmemiş, transfer edilmemiş)
export async function listDepoEntries(req, res, next) {
  try {
    const depo = await findDepoMarket()
    if (!depo) return res.status(404).json({ error: 'DEPO market kaydı bulunamadı' })

    const entries = await prisma.entry.findMany({
      where: { marketId: depo.id, exitItems: { none: {} } },
      orderBy: { createdAt: 'desc' },
      include: {
        product: true,
        producer: true,
        quality: true,
        regionSession: { include: { region: true } },
      },
    })
    res.json({ depoId: depo.id, entries })
  } catch (err) { next(err) }
}

// İrsaliye KESİLMEDEN ÖNCE, çıkış ekranındaki bekleyen kalemi başka bir yere taşı.
// Hedef verilmezse DEPO (eski davranış, "X" butonu); toMarketId verilirse mal
// doğrudan başka bir pazara aktarılır — yanlış pazara yazılan malı düzeltmek için.
// Kalem irsaliyeye hiç girmediği için ledger/kasa hareketi doğmaz — sadece
// Entry.marketId değişir, Transfer kaydı da "kim ne zaman taşıdı" logu olur.
export async function removeEntryToDepo(req, res, next) {
  try {
    const entryId = Number(req.body.entryId ?? req.params.entryId)
    if (!Number.isInteger(entryId) || entryId <= 0) {
      return res.status(400).json({ error: 'Geçersiz giriş kaydı' })
    }

    let target
    if (req.body.toMarketId != null) {
      const toMarketId = Number(req.body.toMarketId)
      if (!Number.isInteger(toMarketId) || toMarketId <= 0) {
        return res.status(400).json({ error: 'Geçersiz hedef pazar' })
      }
      target = await prisma.market.findUnique({ where: { id: toMarketId } })
      if (!target) return res.status(404).json({ error: 'Hedef pazar bulunamadı' })
      // İmha buradan yapılamaz: mal 99'a taşınsa da Entry.source DISCARD olmaz,
      // fire raporuna hiç girmez. İmha için İade veya Depo Transfer akışı var.
      if (target.no === DISCARD_NO) {
        return res.status(400).json({ error: 'İmha için İade veya Depo Transfer akışını kullanın' })
      }
    } else {
      target = await findDepoMarket()
      if (!target) return res.status(404).json({ error: 'DEPO market kaydı bulunamadı' })
    }

    const entry = await prisma.entry.findUnique({
      where: { id: entryId },
      include: { market: true, exitItems: { select: { id: true } } },
    })
    if (!entry) return res.status(404).json({ error: 'Giriş kaydı bulunamadı' })
    // İrsaliyeye girmiş kalem buradan çıkarılamaz — irsaliye düzenleme akışı ayrı
    // (admin /admin/exits/:id). Yoksa kesilmiş faturanın kalemi sessizce kaybolur.
    if (entry.exitItems.length) {
      return res.status(409).json({ error: 'Bu kalem irsaliyeye girmiş, buradan çıkarılamaz' })
    }
    if (entry.marketId === target.id) {
      return res.status(400).json({ error: `Kalem zaten ${target.no === DEPO_NO ? 'depoda' : 'bu pazarda'}` })
    }
    if (isSpecialMarket(entry.market)) {
      return res.status(400).json({ error: 'Özel pazardan kalem çıkarılamaz' })
    }

    // KISMÎ AKTARMA: kalemin tamamı değil bir kısmı taşınabilir. "2 nolu pazarda
    // 4 kasa var, 2'sini aktarmak istiyorum" senaryosu. Miktar verilmezse tamamı
    // taşınır (eski davranış, "X" butonu bunu kullanıyor).
    // Miktar ekseni birime bağlı: kiloda caseCount, bağ/adette weight.
    const countable = isCountable(entry.unit)
    const label = countable ? unitLabel(entry.unit) : 'kasa'
    const entryQty = countable ? entry.weight : entry.caseCount
    const rawQty = req.body.quantity
    const moveQty = rawQty == null ? entryQty : Number(rawQty)

    if (!Number.isInteger(moveQty) || moveQty <= 0) {
      return res.status(400).json({ error: `${label} adedi pozitif tam sayı olmalı` })
    }
    if (moveQty > entryQty) {
      return res.status(400).json({
        error: `Bu kalemde ${entryQty} ${label} var, ${moveQty} aktarılamaz`,
      })
    }

    const createdBy = req.user?.name || req.user?.username || 'Operatör'
    const fromMarketId = entry.marketId
    const partial = moveQty < entryQty
    const qtyLabel = `${moveQty} ${label}`
    const defaultNote = target.no === DEPO_NO
      ? `Çıkış ekranından kaldırıldı${partial ? ` (${qtyLabel})` : ''}`
      : `#${target.no} ${target.name} pazarına aktarıldı${partial ? ` (${qtyLabel})` : ''}`
    const note = req.body.note?.trim() || defaultNote

    const transfer = await prisma.$transaction(async (tx) => {
      // Koşullu update (atomik CAS): iki kullanıcı aynı anda basarsa ikinci 409
      // alsın. İki sayısal alan da guard'da — araya başka bir bölme girmişse
      // bu işlem eski değerlerin üstüne yazmamalı.
      const guard = {
        id: entryId,
        marketId: fromMarketId,
        caseCount: entry.caseCount,
        weight: entry.weight,
      }

      if (!partial) {
        const moved = await tx.entry.updateMany({ where: guard, data: { marketId: target.id } })
        if (moved.count === 0) {
          throw httpError(409, 'Kalem bu sırada başka bir işlemle taşındı, listeyi yenileyin')
        }
        return tx.transfer.create({
          data: { entryId, fromMarketId, toMarketId: target.id, note, createdBy },
          include: {
            entry: { include: { product: true, quality: true } },
            fromMarket: true,
            toMarket: true,
          },
        })
      }

      // Bölme. Kilo oransal ayrılır — burada yeniden tartım yok, bu bir düzeltme
      // işlemi (yanlış pazara yazılan malın bir kısmını doğru pazara almak).
      // Bağ/adette "kilo" zaten miktarın kendisi olduğu için pay = moveQty.
      const share = countable ? moveQty : round2(entry.weight * (moveQty / entry.caseCount))

      // Kasa da bölünür (bağ/adet dahil — kasa hesabı artık her birimde işliyor).
      // Kiloda miktar ekseni zaten kasa; bağ/adette kasa oransal ayrılır ve
      // ÇIKARMAYLA kapatılır: yuvarlama iki tarafa da yazılırsa toplam kasa
      // sessizce artar ya da azalır, bölge/bayi bakiyesi kayar.
      const movedCases = countable
        ? Math.round((entry.caseCount ?? 0) * (moveQty / entryQty))
        : moveQty

      const reduced = await tx.entry.updateMany({
        where: guard,
        data: {
          caseCount: (entry.caseCount ?? 0) - movedCases,
          weight: round2(entry.weight - share),
        },
      })
      if (reduced.count === 0) {
        throw httpError(409, 'Kalem bu sırada başka bir işlemle taşındı, listeyi yenileyin')
      }

      // Taşınan kısım yeni bir kayıt olur. CaseMovement YAZILMAZ: bölgeden dönen
      // kasa mal kabulde zaten sayıldı, bölmek o gerçeği değiştirmiyor.
      const newEntry = await tx.entry.create({
        data: {
          regionSessionId: entry.regionSessionId,
          productId: entry.productId,
          producerId: entry.producerId,
          qualityId: entry.qualityId,
          caseCount: movedCases,
          weight: share,
          unit: entry.unit,
          weak: entry.weak,
          disposableCase: entry.disposableCase,
          source: entry.source,
          marketId: target.id,
        },
      })

      return tx.transfer.create({
        data: { entryId: newEntry.id, fromMarketId, toMarketId: target.id, note, createdBy },
        include: {
          entry: { include: { product: true, quality: true } },
          fromMarket: true,
          toMarket: true,
        },
      })
    })

    auditCreate(
      req, 'transfer', transfer.id,
      `${transfer.entry?.product?.name ?? 'Kalem'} · ${transfer.fromMarket ? `#${transfer.fromMarket.no}` : '—'} → ${transfer.toMarket ? `#${transfer.toMarket.no}` : '—'}`,
    )
    res.status(201).json(transfer)
  } catch (err) { next(err) }
}

// Yanlış dokunuşu geri al: kalem geldiği pazara döner. Orijinal Transfer SİLİNMEZ
// (iz kalsın), ters yönde ikinci bir Transfer yazılır. Gri satır kendiliğinden
// düşer çünkü liste yalnızca "hâlâ depoda olan" kalemleri gösteriyor.
//
// KISMÎ AKTARMADA: geri alınan yalnızca taşınan parçadır, kalem yeniden
// birleşmez — kaynak pazarda kalan kısımla dönen kısım iki ayrı satır olarak
// durur. Toplam miktar doğrudur, yalnız satır bölünmüş kalır.
export async function undoRemoveEntryToDepo(req, res, next) {
  try {
    const transferId = Number(req.params.id)
    if (!Number.isInteger(transferId) || transferId <= 0) {
      return res.status(400).json({ error: 'Geçersiz kayıt' })
    }

    const original = await prisma.transfer.findUnique({
      where: { id: transferId },
      include: {
        entry: { include: { exitItems: { select: { id: true } } } },
        fromMarket: true,
      },
    })
    if (!original) return res.status(404).json({ error: 'Kaldırma kaydı bulunamadı' })
    // Yalnızca çıkış ekranından yapılan kaldırma/aktarma geri alınabilir. Bunlar
    // her zaman NORMAL bir pazardan başlar; depo transferi (createGroupedTransfer)
    // ise depodan başlar ve split ile entry bölebildiği için geri alınamaz.
    if (isSpecialMarket(original.fromMarket)) {
      return res.status(400).json({ error: 'Bu kayıt bir kaldırma işlemi değil' })
    }
    // Kalem hâlâ transferin götürdüğü yerde mi? Değilse araya başka bir taşıma
    // girmiş demektir; geri almak onu sessizce ezerdi.
    if (original.entry.marketId !== original.toMarketId) {
      return res.status(409).json({ error: 'Kalem artık burada değil, geri alınamaz' })
    }
    if (original.entry.exitItems.length) {
      return res.status(409).json({ error: 'Kalem irsaliyeye girmiş, geri alınamaz' })
    }

    const createdBy = req.user?.name || req.user?.username || 'Operatör'

    const restored = await prisma.$transaction(async (tx) => {
      const moved = await tx.entry.updateMany({
        where: { id: original.entryId, marketId: original.toMarketId },
        data: { marketId: original.fromMarketId },
      })
      if (moved.count === 0) {
        throw httpError(409, 'Kalem bu sırada taşındı, listeyi yenileyin')
      }
      return tx.transfer.create({
        data: {
          entryId: original.entryId,
          fromMarketId: original.toMarketId,
          toMarketId: original.fromMarketId,
          note: `Kaldırma geri alındı (#${original.id})`,
          createdBy,
        },
        include: { entry: { include: { product: true } }, fromMarket: true, toMarket: true },
      })
    })

    auditCreate(
      req, 'transfer', restored?.id ?? null,
      `Transfer geri alındı · ${restored?.entry?.product?.name ?? 'Kalem'}`,
    )
    res.json(restored)
  } catch (err) { next(err) }
}

const round2 = (n) => Math.round(n * 100) / 100

// Ürün bazında toplu transfer: FIFO ile entry'leri tüket (tam/split)
export async function createGroupedTransfer(req, res, next) {
  try {
    const {
      productId, requestedCases, requestedWeight, toMarketId, note, weak, disposableCase, unit,
    } = req.body
    if (!productId || !toMarketId || !requestedCases) {
      return res.status(400).json({ error: 'Ürün, hedef pazar ve kasa adedi zorunlu' })
    }

    // Birim istemciden gelir: depo grubu Entry.unit SNAPSHOT'ını taşır. Ürünün
    // birimi cutover'da değişmiş olabilir, o yüzden depoda aynı ürünün hem CASE
    // hem BUNCH girişi bulunabilir — bunlar ayrı grup, ayrı transfer, birbirine
    // karıştırılamaz. Gövdede yoksa ürünün güncel birimine düşülür.
    const product = await prisma.product.findUnique({
      where: { id: Number(productId) },
      select: { unit: true },
    })
    if (!product) return res.status(404).json({ error: 'Ürün bulunamadı' })
    const entryUnit = normalizeUnit(unit, product.unit)
    const countable = isCountable(entryUnit)
    // Miktar ekseninin etiketi: kiloda kasa sayılır, bağ/adette birimin kendisi.
    const label = countable ? unitLabel(entryUnit) : 'kasa'

    const totalRequested = Number(requestedCases)
    if (!Number.isInteger(totalRequested) || totalRequested <= 0) {
      return res.status(400).json({ error: `${label} adedi pozitif tam sayı olmalı` })
    }

    // Kasa modunda tartılan kilo zorunlu. Depodaki kilo mal kabuldeki değerdir;
    // malın bekleme süresinde fire verdiği bilinen bir şey ve irsaliye tutarı kilo
    // üzerinden hesaplanıyor. Kasa oranından tahmin edip faturalamak yerine
    // sevkiyatta tartılan değeri esas alıyoruz.
    // Bağ/adet modunda tartı YOK: miktar sayılabilir birim, yolda azalmaz —
    // istenen adet ile çıkan adet aynıdır.
    const totalWeight = countable ? totalRequested : Number(requestedWeight)
    if (!countable && (!Number.isFinite(totalWeight) || totalWeight <= 0)) {
      return res.status(400).json({ error: 'Tartılan kilo pozitif olmalı' })
    }

    const depo = await findDepoMarket()
    if (!depo) return res.status(404).json({ error: 'DEPO market kaydı bulunamadı' })

    if (Number(toMarketId) === depo.id) {
      return res.status(400).json({ error: 'Hedef depodan farklı bir pazar olmalı' })
    }

    const target = await prisma.market.findUnique({ where: { id: Number(toMarketId) } })
    if (!target) return res.status(404).json({ error: 'Hedef pazar bulunamadı' })

    // Depodaki mal da dökülebilir: 99'a transfer = imha. Entry'nin source'u
    // DISCARD olmalı ki fire raporuna girsin ve mal kabul hacmine sayılmasın.
    const toDiscard = target.no === DISCARD_NO

    // Bu ürünün depodaki bekleyen entry'leri (oldest first)
    // weak parametresi verilmişse sadece o tipteki entry'leri al (zayıf vs normal ayrımı)
    const where = {
      marketId: depo.id,
      productId: Number(productId),
      exitItems: { none: {} },
    }
    if (typeof weak === 'boolean') where.weak = weak
    // Siyah kasa ayrı grup: filtrelenmezse FIFO iki grubu birden tüketir, depo
    // ekranındaki grup toplamları ve "yeterli stok var mı" kontrolü yalan söyler.
    if (typeof disposableCase === 'boolean') where.disposableCase = disposableCase
    // Birim de filtreye girer: cutover sonrası aynı ürünün eski kasa girişleri
    // depoda durabilir, iki eksen tek FIFO'da toplanamaz.
    where.unit = entryUnit

    // MODUN TEK TANIMI: miktar hangi kolonda duruyor.
    const qtyOf = countable ? (e) => e.weight : (e) => e.caseCount

    const candidates = await prisma.entry.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { exitItems: true },
    })

    const available = candidates.reduce((s, e) => s + qtyOf(e), 0)
    if (totalRequested > available) {
      return res.status(400).json({ error: `Depoda sadece ${available} ${label} var, ${totalRequested} talep edildi` })
    }

    const createdBy = req.user?.name || req.user?.username || 'Depo'

    const transfers = await prisma.$transaction(async (tx) => {
      // Aday listesi ve stok tx İÇİNDE yeniden okunur. Yukarıdaki okuma bayat
      // olabilir: iki depocu aynı anda transfer başlatırsa ikisi de eski
      // caseCount'u görür, guard'sız update birbirini ezer ve kasa çoğalır.
      const freshCandidates = await tx.entry.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: { exitItems: { select: { id: true } } },
      })
      const availableNow = freshCandidates.reduce((s, e) => s + qtyOf(e), 0)
      if (totalRequested > availableNow) {
        throw httpError(409, `Depoda sadece ${availableNow} ${label} kaldı, ${totalRequested} talep edildi`)
      }

      // Önce FIFO planı çıkarılır: hangi entry'den ne kadar. Kasa modunda kilo bu
      // plan üzerinden dağıtılır, çünkü tartılan toplam kiloyu entry'lere bölmek
      // için önce hangi entry'lerin kapsandığını bilmek gerekiyor.
      const plan = []
      let remaining = totalRequested
      for (const entry of freshCandidates) {
        if (remaining <= 0) break
        if (entry.exitItems.length > 0) continue
        const entryQty = qtyOf(entry)
        if (entryQty <= 0) continue // savunma: 0'lı satır planı kilitlemesin
        const takeQty = Math.min(remaining, entryQty)
        const fullEntry = takeQty === entryQty
        // KİLO: kısmî tüketimde entry içindeki tek tek kasaların kilosu bilinmiyor —
        //       depoda kalacak payı ayırmak için kasa oranı tek makul ölçü.
        // BAĞ/ADET: pay miktarın kendisi; sayı zaten bölünebilir tam sayı.
        const share = countable
          ? takeQty
          : (fullEntry ? entry.weight : round2(entry.weight * (takeQty / entry.caseCount)))
        // Giden fiziksel kasa. Kiloda miktar ekseni zaten kasa. Bağ/adette kasa
        // ayrı bir eksen ve oransal gider — kasa hesabı artık her birimde işliyor.
        const takeCases = countable
          ? (fullEntry ? (entry.caseCount ?? 0) : Math.round((entry.caseCount ?? 0) * (takeQty / entryQty)))
          : takeQty
        plan.push({ entry, takeQty, fullEntry, share, takeCases })
        remaining -= takeQty
      }

      // Tartı kayıtlı kilodan fazla çıkamaz: fazlası depoda karşılığı olmayan
      // kilo yaratır. Mal beklerken ağırlaşmadığına göre bu veri girişi hatasıdır.
      // Bağ/adet modunda ikinci bir eksen yok, kontrol de gereksiz.
      const takeableWeight = round2(plan.reduce((s, p) => s + p.share, 0))
      // TARTI KAYITTAN FAZLA OLABİLİR (Osman'ın kararı, 2026-08-13).
      //
      // Eskiden totalWeight > takeableWeight kesin reddediliyordu. Sahada işi
      // tıkıyordu: mal kabulde kilo eksik girilmiş olabiliyor, tartı 450 diyor
      // ama depo kaydı 423.86 gösteriyordu ve sevkiyat hiç yapılamıyordu.
      //
      // Stok açısından güvenli: bölmede depoda KALAN kısım `share` (kayıtlı
      // oransal pay) üzerinden hesaplanıyor, operatörün yazdığı tartıdan değil.
      // Yani fazlalık girilse de kalan asla eksiye düşmüyor; yalnızca çıkan
      // kaydın kilosu kayıttakinden yüksek oluyor ve fark nota işleniyor.
      //
      // Tek koruma yazım hatasına karşı: kilo irsaliyede fiyatla çarpılıp
      // faturaya gittiği için 450 yerine 4500 yazılması sessizce geçmemeli.
      // Sınır bilerek geniş — gerçek tartı sapması hiçbir zaman buraya varmaz.
      const typoLimit = Math.max(takeableWeight * 3, takeableWeight + 100)
      if (!countable && totalWeight > typoLimit) {
        throw httpError(400,
          `${totalWeight} kg, ${totalRequested} kasa için makul sınırın çok üstünde ` +
          `(depo kaydı ${takeableWeight} kg). Yazım hatası olabilir — kontrol edin.`)
      }

      if (countable) {
        // Dağıtım yok: her parçanın miktarı planın kendisi. Yuvarlama artığı da
        // yok, tam sayılarla çalışıyoruz.
        plan.forEach((p) => { p.weight = p.takeQty })
      } else {
        // Tartılan kilo, entry'lerin kayıtlı kilo payları oranında bölünür.
        // Son parça yuvarlama artığını üstlenir ki toplam tam tutsun.
        let allocated = 0
        plan.forEach((p, i) => {
          p.weight = i === plan.length - 1
            ? Math.max(0, round2(totalWeight - allocated))
            : round2(totalWeight * (p.share / takeableWeight))
          allocated = round2(allocated + p.weight)
        })
      }

      // Tartı farkı. Pozitif = fire (kilo yolda kayboldu), negatif = fazlalık
      // (mal kabulde eksik girilmiş). İKİSİ DE nota yazılır — yoksa fark sessizce
      // kaybolur ve sonradan "bu kilo nereden çıktı" sorusunun cevabı olmaz.
      // Bağ/adette tartı yok, fark da yok.
      const shrink = countable ? 0 : round2(takeableWeight - totalWeight)
      const baseNote = note?.trim() || null
      const prefix = baseNote ? `${baseNote} — ` : ''
      let noteText = baseNote
      if (shrink > 0.01) {
        noteText = `${prefix}Tartı farkı: -${shrink} kg (depo ${takeableWeight} kg, çıkan ${totalWeight} kg)`
      } else if (shrink < -0.01) {
        noteText = `${prefix}Tartı fazlası: +${round2(-shrink)} kg (depo ${takeableWeight} kg, çıkan ${totalWeight} kg)`
      }

      const results = []
      for (const { entry, takeQty, fullEntry, share, weight, takeCases } of plan) {
        // CAS guard'ı: okunan satırın İKİ sayısal alanı da değişmemiş olmalı.
        // DİKKAT — eski kod `caseCount: takeQty` yazıyordu; bu yalnızca fullEntry
        // dalında tesadüfen doğruydu ve bağ modunda takeQty miktar eksenine ait
        // olduğu için YANLIŞ kolonu karşılaştırırdı.
        const casGuard = {
          id: entry.id,
          marketId: depo.id,
          caseCount: entry.caseCount,
          weight: entry.weight,
        }

        if (fullEntry) {
          // Entry tamamen hedefe taşınır — koşullu update ile (atomik CAS).
          // weight de guard'da: kilo artık yazıldığı için okuma bayatsa ezmemeli.
          const moved = await tx.entry.updateMany({
            where: casGuard,
            data: { marketId: Number(toMarketId), weight, ...(toDiscard && { source: 'DISCARD' }) },
          })
          if (moved.count === 0) {
            throw httpError(409, 'Depo stoğu işlem sırasında değişti, tekrar deneyin')
          }
          const t = await tx.transfer.create({
            data: {
              entryId: entry.id,
              fromMarketId: depo.id,
              toMarketId: Number(toMarketId),
              note: noteText,
              createdBy,
            },
            include: { entry: { include: { product: true } }, fromMarket: true, toMarket: true },
          })
          results.push(t)
        } else {
          // Entry split. Depoda kalan kısım kendi oransal payını korur (share
          // düşülür, tartılan weight değil) — fark giden mala ait, depoda
          // kalan kasalara yazılırsa kalan stok şişer.
          // Bağ/adet modunda share === takeQty, yani kalan = kalan bağ/adet.
          // Kasa her birimde çıkarmayla kapanır (takeCases oransal hesaplandı) —
          // iki tarafa da yuvarlama yazılırsa toplam kasa sessizce kayar.
          const remainingWeight = round2(entry.weight - share)
          const remainingCases = (entry.caseCount ?? 0) - takeCases

          const reduced = await tx.entry.updateMany({
            where: casGuard,
            data: { caseCount: remainingCases, weight: remainingWeight },
          })
          if (reduced.count === 0) {
            throw httpError(409, 'Depo stoğu işlem sırasında değişti, tekrar deneyin')
          }

          const newEntry = await tx.entry.create({
            data: {
              regionSessionId: entry.regionSessionId,
              productId: entry.productId,
              producerId: entry.producerId,
              qualityId: entry.qualityId,
              caseCount: takeCases,
              weight,
              unit: entry.unit, // snapshot taşınır, ürün sonradan değişse de sabit
              weak: entry.weak,
              // Taşınmazsa siyah kasa işareti split'te kaybolur ve giden mal
              // hedef pazara kasa borcu yazdırır.
              disposableCase: entry.disposableCase,
              source: toDiscard ? 'DISCARD' : entry.source,
              marketId: Number(toMarketId),
            },
          })
          const t = await tx.transfer.create({
            data: {
              entryId: newEntry.id,
              fromMarketId: depo.id,
              toMarketId: Number(toMarketId),
              note: noteText,
              createdBy,
            },
            include: { entry: { include: { product: true } }, fromMarket: true, toMarket: true },
          })
          results.push(t)
        }
      }
      return { results, shrink }
    })

    auditCreate(
      req, 'transfer', transfers.results?.[0]?.id ?? null,
      `Depo transferi · ${transfers.results?.length ?? 0} kalem · ${totalRequested} ${entryUnit ?? ''}`.trim(),
      transfers.results?.length ?? 0,
    )
    res.status(201).json({
      transfers: transfers.results,
      totalTransferred: totalRequested,
      unit: entryUnit,                      // istemci toast'ı doğru etiketlesin
      totalWeight: countable ? null : totalWeight,
      shrink: transfers.shrink,
      entriesAffected: transfers.results.length,
    })
  } catch (err) { next(err) }
}

// Bir bayiye hangi üründen ne kadar GÖNDERİLDİ ve ne kadar İADE alındı.
//
// NEDEN: İade ekranı ürünü tüm katalogdan seçtiriyordu; operatör yanlış ürün ya
// da yanlış bayi seçince sistem sessizce kabul ediyordu. Canlıda 17 iadenin 6'sı
// bayiye hiç gönderilmemiş üründendi (2026-08-13). Tutar 0 ₺ kaldı çünkü o
// ürünlerin fiyatı yoktu — fiyat girilir girilmez aynı hata bayiye gerçek
// alacak yazacaktı.
//
// PENCERE 7 GÜN (Osman'ın kararı): daha eski irsaliyeler "gönderilmiş"
// sayılmıyor. Mal çabuk bozuluyor; 3 hafta önce gönderilen malın iadesi de
// şüpheli, o yüzden o da uyarı üretmeli.
//
// Miktar ekseni Entry.weight: kasalı üründe kilo, bağ/adetli üründe bağ sayısı
// (bkz. utils/units.js). Kasa adedi ayrıca dönüyor.
export const RETURN_WINDOW_DAYS = 7

export async function marketProductBalance(req, res, next) {
  try {
    const marketId = Number(req.params.id)
    if (!Number.isInteger(marketId) || marketId <= 0) {
      return res.status(400).json({ error: 'Geçersiz bayi' })
    }
    const since = new Date(Date.now() - RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000)

    // ExitItem → Entry join'i gerektiği için raw: Prisma groupBy ilişkili
    // kolona göre gruplayamıyor (aynı gerekçe analyticsController'da da var).
    const [sent, returned] = await Promise.all([
      prisma.$queryRaw`
        SELECT e."productId"                              AS "productId",
               COALESCE(SUM(e."weight"), 0)::float        AS "sentQty",
               COALESCE(SUM(e."caseCount"), 0)::int       AS "sentCases",
               MAX(x."createdAt")                         AS "lastSentAt"
        FROM "ExitItem" xi
        JOIN "Exit" x  ON x.id  = xi."exitId"
        JOIN "Entry" e ON e.id  = xi."entryId"
        WHERE x."marketId" = ${marketId} AND x."createdAt" >= ${since}
        GROUP BY e."productId"
      `,
      // İadeler de aynı pencerede: 7 gün önceki iade, 7 günlük gönderimden
      // düşülürse kalan yanlış çıkar.
      prisma.returnRecord.groupBy({
        by: ['productId'],
        where: { marketId, createdAt: { gte: since } },
        _sum: { weight: true, caseCount: true },
      }),
    ])

    const returnedMap = new Map(
      returned.map((r) => [r.productId, {
        qty: r._sum.weight ?? 0,
        cases: r._sum.caseCount ?? 0,
      }]),
    )

    const products = await prisma.product.findMany({
      where: { id: { in: sent.map((s) => s.productId) } },
      select: { id: true, name: true, icon: true, unit: true },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))

    const rows = sent
      .map((s) => {
        const p = productMap.get(s.productId)
        const ret = returnedMap.get(s.productId) ?? { qty: 0, cases: 0 }
        return {
          productId: s.productId,
          name: p?.name ?? '—',
          icon: p?.icon ?? null,
          unit: p?.unit ?? 'CASE',
          sentQty: Math.round(s.sentQty * 100) / 100,
          sentCases: s.sentCases,
          returnedQty: Math.round(ret.qty * 100) / 100,
          returnedCases: ret.cases,
          // Kalan = gönderilen - iade edilen. Negatif olabilir: bayi aldığından
          // fazla iade etmiş demektir, ekran bunu uyarı olarak gösteriyor.
          netQty: Math.round((s.sentQty - ret.qty) * 100) / 100,
          lastSentAt: s.lastSentAt,
        }
      })
      .sort((a, b) => new Date(b.lastSentAt) - new Date(a.lastSentAt))

    res.json({ marketId, windowDays: RETURN_WINDOW_DAYS, since, products: rows })
  } catch (err) { next(err) }
}

// --- İade ortak mantığı ---------------------------------------------------
// createReturn (tek satır) ve createReturnBatch (çok satır) aynı kodu kullanır.
// Ayrılmasının sebebi: toplu iadede satırlar TEK transaction'da yazılmalı.
// Sıralı ayrı isteklerde 3. satır patlarsa ilk ikisi bayinin cari hesabına
// işlenmiş olur; operatör hatayı görüp baştan girince tutar iki kez düşülür.

// Bir iade satırını doğrular ve normalize eder. Hata olursa httpError fırlatır.
// prefix: toplu girişte "2. satır: " gibi — operatör hangi satır olduğunu bilsin.
async function prepareReturnRow(row, { market, depoMarket, discardMarket, prefix = '' }) {
  const { productId, caseCount, weight, weak, disposableCase,
    destination, toMarketId, discarded, pricePerKg, note, qualityId } = row

  if (!productId || !weight) throw httpError(400, `${prefix}Ürün ve miktar zorunlu`)

  // discarded eski istemciler için korunuyor; destination verilmişse o kazanır
  const dest = destination ?? (discarded ? 'DISCARD' : 'DEPO')
  if (!['DEPO', 'MARKET', 'DISCARD'].includes(dest)) {
    throw httpError(400, `${prefix}Geçersiz iade hedefi`)
  }

  const product = await prisma.product.findUnique({
    where: { id: Number(productId) },
    select: { id: true, name: true, unit: true },
  })
  if (!product) throw httpError(404, `${prefix}Ürün bulunamadı`)
  const countable = isCountable(product.unit)

  // Bağ/adette miktar weight kolonunda ve tam sayı. Kasa her birimde geri
  // gelebilir — bağ/adette opsiyonel (0 olabilir), kiloda zorunlu.
  const c = caseCount == null || caseCount === '' ? 0 : Number(caseCount)
  const w = Number(weight)
  if (countable) {
    if (!Number.isInteger(w) || w < 1) {
      throw httpError(400, `${prefix}${unitLabel(product.unit)} miktarı pozitif tam sayı olmalı`)
    }
    if (!Number.isInteger(c) || c < 0) {
      throw httpError(400, `${prefix}Kasa adedi 0 veya pozitif tam sayı olmalı`)
    }
  } else {
    if (!Number.isInteger(c) || c < 1) {
      throw httpError(400, `${prefix}Kasa adedi pozitif tam sayı olmalı`)
    }
    if (!Number.isFinite(w) || w <= 0) throw httpError(400, `${prefix}Ağırlık pozitif olmalı`)
  }

  // Hedef pazarı belirle
  let targetMarket
  if (dest === 'DEPO') {
    if (!depoMarket) throw httpError(404, 'DEPO market kaydı bulunamadı')
    targetMarket = depoMarket
  } else if (dest === 'DISCARD') {
    if (!discardMarket) throw httpError(404, `İmha pazarı (no ${DISCARD_NO}) tanımlı değil`)
    targetMarket = discardMarket
  } else {
    if (!toMarketId) throw httpError(400, `${prefix}Hedef pazar seçilmeli`)
    targetMarket = await prisma.market.findUnique({ where: { id: Number(toMarketId) } })
    if (!targetMarket) throw httpError(404, `${prefix}Hedef pazar bulunamadı`)
    if (isSpecialMarket(targetMarket)) throw httpError(400, `${prefix}Hedef normal bir bayi olmalı`)
    if (targetMarket.id === market.id) {
      throw httpError(400, `${prefix}Hedef, iadeyi veren bayiden farklı olmalı`)
    }
  }

  // Fiyat: önce body, sonra bugünün fiyat tablosu
  let unitPrice = pricePerKg != null ? Number(pricePerKg) : null
  let priceMissing = false
  if (unitPrice == null) {
    const priceMap = await getPriceMap(toPriceDate())
    // Kalitesiz iade artık fiyat bulabiliyor: eskiden qualityId yoksa arama hiç
    // yapılmıyordu (key null) ve her iade priceMissing dönüyordu.
    const found = priceOf(priceMap, productId, qualityId)
    // Fiyat bulunamazsa 0 yazılıp sessizce geçilirdi: iade kaydedilir ama
    // bayinin borcundan hiçbir şey düşmezdi. Artık istemciye haber veriyoruz.
    priceMissing = found == null
    unitPrice = found ?? 0
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) throw httpError(400, `${prefix}Fiyat geçersiz`)

  return {
    product, countable, dest, targetMarket, c, w, unitPrice, priceMissing,
    amount: Math.round(unitPrice * w * 100) / 100,
    weak: !!weak,
    disposableCase: !!disposableCase,
    qualityId: qualityId ? Number(qualityId) : null,
    note: note?.trim() || null,
  }
}

// Hazırlanmış satırı yazar: Entry (+Transfer) + LedgerEntry (+CaseMovement) + ReturnRecord
// occurredAt: iadenin GERÇEK zamanı. Offline kuyrukta bekleyen kayıt saatler
// sonra gönderilebiliyor; sync anını yazmak cari hesabı yanlış güne düşürür.
// Verilmezse şimdi — tek satırlık iade (createReturn) bu yolu kullanıyor.
async function writeReturnRow(tx, p, { market, createdBy, occurredAt = new Date() }) {
  // İmha da dahil her durumda entry oluşur. Eskiden imhada hiç entry
  // yazılmıyordu — mal kayıtlardan buharlaşıyor, fire raporlanamıyordu.
  const entry = await tx.entry.create({
    data: {
      regionSessionId: null,
      productId: p.product.id,
      qualityId: p.qualityId,
      producerId: null,
      caseCount: p.c,
      weight: p.w,
      unit: p.product.unit,
      weak: p.weak,
      disposableCase: p.disposableCase,
      source: p.dest === 'DISCARD' ? 'DISCARD' : 'RETURN',
      marketId: p.targetMarket.id,
    },
    include: { product: true, market: true },
  })

  // Not metinlerinde miktar birime göre yazılır: "12 kasa" / "30 bağ" / "8 adet"
  const qtyLabel = p.countable ? `${p.w} ${unitLabel(p.product.unit)}` : `${p.c} kasa`

  // Başka bayiye yönlendirme izlenebilir olmalı — Transfer kaydı bırak
  if (p.dest === 'MARKET') {
    await tx.transfer.create({
      data: {
        entryId: entry.id,
        fromMarketId: market.id,
        toMarketId: p.targetMarket.id,
        note: `İade yönlendirme: ${qtyLabel} ${p.product.name}`,
        createdBy,
      },
    })
  }

  const destLabel = p.dest === 'DISCARD'
    ? 'imha'
    : p.dest === 'MARKET' ? `→ ${p.targetMarket.name}` : 'depoya'
  const noteText = p.note ||
    `İade (${destLabel}): ${qtyLabel} ${p.product.name}${p.countable ? '' : `, ${p.w} kg`} (Entry #${entry.id})`

  // Ledger: bayi borcu azalır (negatif tutar = kredi notu)
  const ledger = await tx.ledgerEntry.create({
    data: {
      type: 'MARKET_ADJUSTMENT',
      amount: -p.amount,
      marketId: market.id,
      note: noteText,
      occurredAt,
      createdBy,
    },
  })

  // Kasa hareketi: bayiden boş kasalar düşer. Siyah/karton kasada gelen
  // iadede hareket YAZILMAZ — o kasa bayiye hiç yazılmamıştı, düşülecek bir
  // borç yok. ReturnRecord.caseMovementId nullable, boş kalması sorun değil.
  const trackedQty = trackedCases({ caseCount: p.c, disposableCase: p.disposableCase })
  const caseMove = trackedQty > 0
    ? await tx.caseMovement.create({
      data: { type: 'MARKET_IN', qty: trackedQty, marketId: market.id, note: noteText, occurredAt, createdBy },
    })
    : null

  // ReturnRecord — üç kaydı tek doküman altında birleştir
  const returnRecord = await tx.returnRecord.create({
    data: {
      marketId: market.id,
      productId: p.product.id,
      qualityId: p.qualityId,
      caseCount: p.c,
      weight: p.w,
      pricePerKg: p.unitPrice,
      amount: p.amount,
      unit: p.product.unit,
      weak: p.weak,
      disposableCase: p.disposableCase,
      discarded: p.dest === 'DISCARD',
      note: p.note,
      entryId: entry.id,
      ledgerEntryId: ledger.id,
      caseMovementId: caseMove?.id ?? null,
      createdBy,
    },
  })

  return { returnRecord, entry, ledger, caseMove, amount: p.amount, unitPrice: p.unitPrice }
}

// İadeyi veren bayi + hedef pazar kayıtlarını bir kez çözer (toplu girişte
// her satır için tekrar sorgulamamak adına).
async function resolveReturnContext(fromMarketId) {
  const market = await prisma.market.findUnique({ where: { id: Number(fromMarketId) } })
  if (!market || isSpecialMarket(market)) throw httpError(400, 'Geçerli bir bayi seçilmeli')
  const [depoMarket, discardMarket] = await Promise.all([findDepoMarket(), findDiscardMarket()])
  return { market, depoMarket, discardMarket }
}

// Bayiden TOPLU iade kabul: tek bayi, çok satır, TEK transaction.
// Hepsi ya yazılır ya hiçbiri — cari hesaba yarım işlenmiş iade kalmaz.
export async function createReturnBatch(req, res, next) {
  // clientId try DIŞINDA: catch bloğu da okuyor (P2002 yarış durumu).
  // Offline kuyruğun idempotency anahtarı — mal kabuldeki ENTRY_BATCH ile aynı
  // mekanizma (bkz. SyncedBatch). İade cari hesaba KREDİ yazdığı için çift
  // kayıt doğrudan para hatası olur.
  const { clientId } = req.body

  try {
    const { fromMarketId, rows, occurredAt } = req.body
    if (!fromMarketId) return res.status(400).json({ error: 'İade veren bayi seçilmeli' })
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ error: 'En az bir iade satırı gerekli' })
    }

    // Bu parti daha önce işlendi mi? Ucuz ön kontrol; asıl garanti
    // transaction'daki PK ihlali.
    if (clientId) {
      const seen = await prisma.syncedBatch.findUnique({ where: { clientId } })
      if (seen) return res.json({ alreadySynced: true, recordIds: seen.recordIds, count: seen.recordIds.length })
    }

    // İadenin GERÇEK zamanı. Offline kuyrukta bekleyen kayıt saatler sonra
    // gönderilebiliyor; sync anını yazmak cari hesabı yanlış güne düşürür.
    // İstemci saatine körü körüne güvenilmiyor: gelecekteki ya da 7 günden eski
    // tarih reddedilip sunucu saatine düşülüyor.
    const clientTime = occurredAt ? new Date(occurredAt) : null
    const now = Date.now()
    const gecerli = clientTime
      && !Number.isNaN(clientTime.getTime())
      && clientTime.getTime() <= now + 60_000
      && clientTime.getTime() > now - 7 * 24 * 60 * 60 * 1000
    const islemZamani = gecerli ? clientTime : new Date()

    const ctx = await resolveReturnContext(fromMarketId)
    // Doğrulama transaction DIŞINDA: hata olursa hiç transaction açılmasın ve
    // operatör hangi satırın hatalı olduğunu görsün.
    const prepared = []
    for (let i = 0; i < rows.length; i++) {
      prepared.push(await prepareReturnRow(rows[i], { ...ctx, prefix: `${i + 1}. satır: ` }))
    }

    const createdBy = req.user?.name || req.user?.username || 'Depo'
    const results = await prisma.$transaction(async (tx) => {
      // İLK ADIM idempotency kaydı: PK ihlali burada patlarsa hiçbir satır
      // yazılmaz, yarış durumu kapanır.
      if (clientId) {
        await tx.syncedBatch.create({
          data: { clientId, kind: 'RETURN_BATCH', recordIds: [], createdBy },
        })
      }
      const out = []
      for (const p of prepared) {
        out.push(await writeReturnRow(tx, p, { market: ctx.market, createdBy, occurredAt: islemZamani }))
      }
      if (clientId) {
        await tx.syncedBatch.update({
          where: { clientId },
          data: { recordIds: out.map((r) => r.returnRecord?.id).filter(Boolean) },
        })
      }
      return out
    })

    auditCreate(
      req, 'return', results[0]?.returnRecord?.id ?? null,
      `İade · ${results.length} satır · ${ctx.market ? `Pazar #${ctx.market.no}` : '—'}`,
      results.length,
    )
    res.status(201).json({
      count: results.length,
      totalAmount: Math.round(results.reduce((s, r) => s + r.amount, 0) * 100) / 100,
      // Fiyatı bulunamayan satırlar: borçtan 0 ₺ düşüldü, istemci uyarsın
      priceMissingRows: prepared
        .map((p, i) => (p.priceMissing ? { row: i + 1, product: p.product.name } : null))
        .filter(Boolean),
      returns: results,
    })
  } catch (err) {
    // Eşzamanlı retry: aynı clientId'yi iki istek birden yazmaya çalıştı.
    // Kaybeden taraf hata değil "zaten yazıldı" görmeli.
    if (clientId && err?.code === 'P2002') {
      const seen = await prisma.syncedBatch.findUnique({ where: { clientId } })
      return res.json({ alreadySynced: true, recordIds: seen?.recordIds ?? [], count: seen?.recordIds?.length ?? 0 })
    }
    next(err)
  }
}

// Bayiden iade kabul (tek satır). Mal üç yerden birine gider:
//   DEPO     → depoya alınır, sonra normal transferle sevk edilebilir
//   MARKET   → doğrudan başka bir bayiye yönlendirilir (+ Transfer kaydı)
//   DISCARD  → imha, 99 ATILAN pazarına yazılır (fire raporlanabilsin diye)
// Üç durumda da bayi borcundan düşülür ve boş kasa iadesi işlenir.
export async function createReturn(req, res, next) {
  try {
    const { fromMarketId } = req.body
    if (!fromMarketId) return res.status(400).json({ error: 'Bayi seçilmeli' })

    const ctx = await resolveReturnContext(fromMarketId)
    const prepared = await prepareReturnRow(req.body, ctx)
    const createdBy = req.user?.name || req.user?.username || 'Depo'

    const result = await prisma.$transaction((tx) =>
      writeReturnRow(tx, prepared, { market: ctx.market, createdBy }))

    auditCreate(
      req, 'return', result?.returnRecord?.id ?? null,
      `İade · ${prepared.product?.name ?? 'Ürün'} · ${ctx.market ? `Pazar #${ctx.market.no}` : '—'}`,
    )
    res.status(201).json({
      ...result,
      destination: prepared.dest,
      targetMarket: {
        id: prepared.targetMarket.id,
        no: prepared.targetMarket.no,
        name: prepared.targetMarket.name,
      },
      // İstemci uyarı gösterebilsin: fiyat bulunamadıysa borçtan 0₺ düşüldü
      priceMissing: prepared.priceMissing,
    })
  } catch (err) { next(err) }
}

// İade kayıtları listele
export async function listReturns(req, res, next) {
  try {
    const { marketId, dateFrom, dateTo, limit, dest } = req.query
    const where = {}
    if (marketId) where.marketId = Number(marketId)
    // Hedef filtresi eskiden frontend'deydi; sayfalama gelince yalnızca görünen
    // sayfayı süzüyordu (kullanıcı "imha" seçince 1. sayfadaki imhaları görürdü).
    // no 0 = DEPO, discarded = 99 ATILAN, gerisi normal bayi.
    if (dest === 'discarded') where.discarded = true
    else if (dest === 'depo') { where.discarded = false; where.entry = { market: { no: DEPO_NO } } }
    else if (dest === 'market') { where.discarded = false; where.entry = { market: { no: { not: DEPO_NO } } } }
    if (dateFrom || dateTo) {
      where.createdAt = {}
      // new Date('2026-07-21') UTC gece yarısıdır; .setHours() yerel saat uygular
      // → TR'de üst sınır 20:59'a düşüp günün son 3 saati filtreden kayboluyordu
      if (dateFrom) where.createdAt.gte = startOfLocalDay(dateFrom)
      if (dateTo) where.createdAt.lte = endOfLocalDay(dateTo)
    }
    // limit: iade ekranındaki "son iadeler" kutusu 10 kayıt istiyor. Eskiden
    // limit verilmezse TÜM iadeler dönüyordu — admin İadeler sayfası veri
    // büyüdükçe tabloyu komple çekiyordu. Artık her durumda sayfalanıyor.
    const pg = parsePagination(req, { defaultLimit: Number(limit) > 0 ? Number(limit) : 50 })
    const [returns, total] = await Promise.all([
      prisma.returnRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pg.skip,
        take: pg.limit,
        // entry.market: iadenin nereye gittiği (depo / başka pazar / 99 ATILAN)
        include: { market: true, product: true, entry: { include: { market: true } } },
      }),
      prisma.returnRecord.count({ where }),
    ])

    // Özet TÜM filtrelenmiş küme üzerinden — sayfa üzerinden hesaplanırsa
    // muhasebe ekranındaki tutar/kasa toplamları yanlış olur.
    const [sums, trackedSums, discardedCount, depoCount] = await Promise.all([
      prisma.returnRecord.aggregate({ where, _sum: { amount: true } }),
      // totalCases MUHASEBE rakamı: siyah/karton kasa hariç (bkz. utils/cases.js
      // → trackedCases). O kasa bayiye hiç yazılmamıştı (bkz. writeReturnRow),
      // ham toplam basılırsa "Toplam Kasa" gerçek MARKET_IN hareketinden şişer.
      prisma.returnRecord.aggregate({
        where: { ...where, disposableCase: false },
        _sum: { caseCount: true },
      }),
      prisma.returnRecord.count({ where: { ...where, discarded: true } }),
      prisma.returnRecord.count({
        where: { ...where, discarded: false, entry: { market: { no: DEPO_NO } } },
      }),
    ])
    const summary = {
      totalAmount: Math.round((sums._sum.amount ?? 0) * 100) / 100,
      totalCases: trackedSums._sum.caseCount ?? 0,
      discarded: discardedCount,
      toDepo: depoCount,
      toMarket: total - discardedCount - depoCount,
    }

    res.json({ ...paginated(returns, total, pg), summary })
  } catch (err) { next(err) }
}

// İade'yi geri al — bağlı entry/ledger/casemovement hepsi temizlenir
export async function deleteReturn(req, res, next) {
  try {
    const id = Number(req.params.id)
    const ret = await prisma.returnRecord.findUnique({
      where: { id },
      include: {
        // product yalnızca denetim kaydının okunabilir olması için: iade
        // silindikten sonra hangi ürün olduğu başka yerden öğrenilemiyor.
        product: { select: { name: true } },
        entry: {
          include: {
            exitItems: { select: { id: true } },
            transfers: { select: { id: true } },
          },
        },
      },
    })
    if (!ret) return res.status(404).json({ error: 'İade kaydı bulunamadı' })

    // Engeller transaction'a GİRMEDEN kontrol edilmeli. Postgres'te tx içinde bir
    // statement hata alırsa tx abort durumuna geçer — .catch() hatayı yutsa bile
    // sonraki sorgu "current transaction is aborted" ile patlar ve her şey geri
    // alınır. Yani eskiden FK'ye takılan iade hiç silinemiyor, 500 dönüyordu.
    if (ret.entry?.exitItems?.length > 0) {
      return res.status(409).json({
        error: 'Bu iadenin ürünü irsaliye edilmiş — önce o irsaliyeyi silin',
      })
    }
    if (ret.entry?.transfers?.length > 0) {
      return res.status(409).json({
        error: 'Bu iadenin ürünü başka bir pazara transfer edilmiş — önce o transferi geri alın',
      })
    }
    // Kısmî sevkiyat: entry split edilmişse miktarı iadedekinden az olur.
    // Kalanı silmek stoğu bozar — düzeltme kaydı girilmeli.
    // Miktar ekseni birime bağlı: bağ/adette miktar weight kolonunda durur,
    // kasa üzerinden bakmak guard'ı sessizce devre dışı bırakırdı.
    const retQty = (r) => (isCountable(r.unit) ? r.weight : r.caseCount)
    if (ret.entry && retQty(ret.entry) !== retQty(ret)) {
      return res.status(409).json({
        error: 'Bu iadenin malı kısmen sevk edilmiş — kayıt silinemez, düzeltme kaydı girin',
      })
    }

    await prisma.$transaction(async (tx) => {
      // Sıra önemli: ReturnRecord'un FK'leri SetNull olduğu için önce o silinir,
      // sonra bağlı kayıtlar. catch YOK — hata olursa tx tümüyle geri alınmalı.
      await tx.returnRecord.delete({ where: { id } })
      if (ret.entryId) await tx.entry.delete({ where: { id: ret.entryId } })
      if (ret.ledgerEntryId) await tx.ledgerEntry.delete({ where: { id: ret.ledgerEntryId } })
      if (ret.caseMovementId) await tx.caseMovement.delete({ where: { id: ret.caseMovementId } })
    })

    // İade silmek stok + cari borç + kasa hareketini birlikte geri alıyor;
    // silinen satırların hepsi tek log satırında görünsün.
    auditDelete(
      req, 'return', id,
      `İade silindi · ${ret.product?.name ?? 'Ürün'} · ${ret.amount ?? 0} TL`,
    )
    res.status(204).end()
  } catch (err) { next(err) }
}

// Admin: tüm transfer geçmişi
export async function listTransfers(req, res, next) {
  try {
    const { dateFrom, dateTo, toMarketId } = req.query
    const where = {}
    if (toMarketId) where.toMarketId = Number(toMarketId)
    if (dateFrom || dateTo) {
      where.createdAt = {}
      // new Date('2026-07-21') UTC gece yarısıdır; .setHours() yerel saat uygular
      // → TR'de üst sınır 20:59'a düşüp günün son 3 saati filtreden kayboluyordu
      if (dateFrom) where.createdAt.gte = startOfLocalDay(dateFrom)
      if (dateTo) where.createdAt.lte = endOfLocalDay(dateTo)
    }
    const pg = parsePagination(req)
    const [transfers, total] = await Promise.all([
      prisma.transfer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pg.skip,
        take: pg.limit,
        include: {
          entry: { include: { product: true, quality: true } },
          fromMarket: true,
          toMarket: true,
        },
      }),
      prisma.transfer.count({ where }),
    ])
    res.json(paginated(transfers, total, pg))
  } catch (err) { next(err) }
}
