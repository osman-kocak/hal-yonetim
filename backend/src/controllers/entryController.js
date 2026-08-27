import { prisma } from '../utils/prismaClient.js'
import { auditCreate, auditUpdate, auditDelete } from '../utils/audit.js'
import { trackedCases } from '../utils/cases.js'
import { isCountable, unitLabel, formatQty } from '../utils/units.js'
import { DISCARD_NO, findDepoMarket } from '../utils/markets.js'
import { round2 } from '../utils/money.js'
import { purchasePriceOf } from '../utils/purchasePrices.js'
import { getPurchasePriceMap } from './purchasePriceController.js'
import { clampClientTime, toPriceDate } from '../utils/date.js'

// Üretici bu oturumda kullanılabilir mi? Hata mesajı döner, uygunsa null.
// Arayüz zaten bölgenin listesini gösteriyor; bu, sınırdaki savunma:
// yanlış eşleşen giriş bölge raporlarına sessizce yanlış yazılırdı.
// { error, producer } döner. producer'ı da geri veriyor çünkü alış primi
// (pricePremiumPct) borç hesabı için hemen lazım — ikinci bir sorgu açmaya
// gerek kalmasın.
async function validateProducerForSession(producerId, session) {
  const producer = await prisma.producer.findUnique({
    where: { id: Number(producerId) },
    select: { id: true, name: true, active: true, regionId: true, allRegions: true, pricePremiumPct: true },
  })
  if (!producer) return { error: 'Üretici bulunamadı' }
  if (!producer.active) return { error: 'Pasif üreticiye giriş yapılamaz' }
  // allRegions üreticisi her bölgede geçerli.
  // regionId null olan üretici hiçbir bölge listesinde çıkmaz → giriş de yapılamaz.
  if (!producer.allRegions && producer.regionId !== session.regionId) {
    return { error: 'Bu üretici seçilen bölgeye ait değil' }
  }
  return { error: null, producer }
}

// Offline mal kabul için oturum çözümü.
//
// NEDEN: kesintide RegionSession.id üretilemiyor (numarayı veritabanı veriyor),
// bu yüzden operatör yeni bölgeye geçemiyordu. İstemci artık id uydurmuyor;
// partinin hangi bölgeye ait olduğunu (regionId) gönderiyor, oturumu SUNUCU
// çözüyor — startRegion ile aynı kural: açık oturum varsa o, yoksa yeni.
//
// Kuyrukta bağımlılık grafiği gerekmiyor: her parti bağımsız, düz FIFO korunuyor.
// İki cihaz aynı bölgeyi offline açsa bile sync'te ikisi de AYNI oturuma düşer —
// zaten istenen davranış.
//
// YARIŞ: iki istek aynı anda "açık oturum yok" görebilir. Veritabanındaki
// partial unique index (regionId WHERE status='ACTIVE') ikinciyi P2002 ile
// durduruyor; o taraf mevcut oturumu okuyup devam ediyor.
async function resolveSessionForRegion(tx, regionId, openedAt) {
  const acik = await tx.regionSession.findFirst({
    where: { regionId, status: 'ACTIVE' },
  })
  if (acik) return acik
  try {
    return await tx.regionSession.create({
      data: { regionId, openedAt: openedAt ?? new Date() },
    })
  } catch (err) {
    if (err?.code !== 'P2002') throw err
    // Yarışı kaybettik: karşı taraf oturumu açtı, onu kullan.
    return tx.regionSession.findFirst({ where: { regionId, status: 'ACTIVE' } })
  }
}

// Log özeti: kayıt silinse bile denetim satırı tek başına anlaşılabilir olmalı.
function describeEntry(e) {
  const market = e?.market ? (e.market.no === 0 ? 'Depo' : `Pazar #${e.market.no}`) : '—'
  const qty = `${e?.weight ?? '?'} ${unitLabel(e?.unit)}`
  return `${e?.product?.name ?? 'Ürün'} · ${market} · ${e?.caseCount ?? 0} kasa · ${qty}`
}

async function entrySummary(id) {
  const e = await prisma.entry.findUnique({
    where: { id },
    include: { product: true, market: true, producer: true, ledgerEntry: true },
  })
  if (!e) return `Giriş #${id}`
  // Silinen giriş üretici borcunu da götürüyor (LedgerEntry.entryId Cascade).
  // "Ne kadar borç silindi" sorusunun cevabı kayıt gittikten sonra yalnızca
  // burada kalıyor — tutar özete yazılmazsa geri izlenemez.
  const debt = e.ledgerEntry
    ? ` · üretici borcu ${e.ledgerEntry.amount} TL düştü (${e.producer?.name ?? 'üretici'})`
    : ''
  return `${describeEntry(e)}${debt}`
}

// Entry sil: exit edilmemişse OK.
export async function deleteEntry(req, res, next) {
  try {
    const id = Number(req.params.id)
    const entry = await prisma.entry.findUnique({
      where: { id },
      include: {
        exitItems: { select: { id: true } },
        transfers: { select: { id: true } },
        returnRecord: { select: { id: true } },
      },
    })
    if (!entry) return res.status(404).json({ error: 'Giriş bulunamadı' })
    if (entry.exitItems.length > 0) {
      return res.status(409).json({ error: 'Bu giriş irsaliye edilmiş, silinemez' })
    }
    // ReturnRecord.entryId SetNull: silinirse iade kaydı stokta karşılığı
    // olmayan bir bayi kredisiyle ayakta kalıyordu
    if (entry.returnRecord) {
      return res.status(409).json({
        error: 'Bu giriş bir iade kaydına ait — girişi değil, iade kaydını silin',
      })
    }
    // Transfer FK'si Restrict: engellenmezse generic 400 dönüyordu
    if (entry.transfers.length > 0) {
      return res.status(409).json({
        error: 'Bu giriş transfer edilmiş, silinemez — önce transferi geri alın',
      })
    }

    // Özet silmeden ÖNCE hazırlanıyor: kayıt gittikten sonra "neyi sildi"
    // sorusunun cevabı yalnızca logda kalıyor.
    const summary = await entrySummary(id)
    await prisma.entry.delete({ where: { id } })
    auditDelete(req, 'entry', id, summary)

    res.status(204).end()
  } catch (err) { next(err) }
}

// Entry güncelle: kasa/kg/zayıf düzenleyebilir. exit edilmişse reddedilir. marketId değiştirilemez (transfer kullanılsın).
export async function updateEntry(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { caseCount, weight, marketId, weak, disposableCase, bQuality } = req.body

    const entry = await prisma.entry.findUnique({
      where: { id },
      include: {
        exitItems: { select: { id: true } },
        // Siyah kasa işareti kalkarsa bölge düşümü yeniden yazılacak — regionId lazım
        regionSession: { select: { regionId: true } },
      },
    })
    if (!entry) return res.status(404).json({ error: 'Giriş bulunamadı' })
    if (entry.exitItems.length > 0) {
      return res.status(409).json({ error: 'Bu giriş irsaliye edilmiş, düzenlenemez' })
    }

    // marketId güncellemesi izinli değil — transfer ile yapılsın (pazar bakiyesi tutarsızlığı önleme)
    if (marketId != null && Number(marketId) !== entry.marketId) {
      return res.status(400).json({ error: 'Pazar değişikliği bu ekrandan yapılamaz, depo transfer kullanın' })
    }

    // Validation
    const newCaseCount = caseCount != null ? Number(caseCount) : entry.caseCount
    const newWeight = weight != null ? Number(weight) : entry.weight
    const newWeak = typeof weak === 'boolean' ? weak : entry.weak
    const newDisposable = typeof disposableCase === 'boolean' ? disposableCase : entry.disposableCase
    // B kalite kasa hareketini etkilemez (bkz. utils/cases.js) — bu yüzden
    // aşağıdaki disposableChanged yeniden hesaplama zincirine girmiyor.
    const newBQuality = typeof bQuality === 'boolean' ? bQuality : entry.bQuality

    // Birim, kaydın kendi snapshot'ından okunur — ürünün güncel biriminden değil.
    // Ürün sonradan bağa çevrilse bile bu satır kiloyla girilmişti.
    const countable = isCountable(entry.unit)

    if (countable) {
      // Bağ/adette miktar bölünmez. Kasa OPSİYONEL: mal kasayla da gelebilir
      // (o zaman sayılır), çuvalla/kasasız da (0 girilir).
      if (!Number.isInteger(newWeight) || newWeight < 1) {
        return res.status(400).json({ error: `${unitLabel(entry.unit)} miktarı pozitif tam sayı olmalı` })
      }
      if (!Number.isInteger(newCaseCount) || newCaseCount < 0) {
        return res.status(400).json({ error: 'Kasa adedi 0 veya pozitif tam sayı olmalı' })
      }
    } else {
      if (!Number.isInteger(newCaseCount) || newCaseCount < 1) {
        return res.status(400).json({ error: 'Kasa adedi pozitif tam sayı olmalı' })
      }
      if (!Number.isFinite(newWeight) || newWeight <= 0) {
        return res.status(400).json({ error: 'Ağırlık pozitif olmalı' })
      }
    }

    const disposableChanged = newDisposable !== entry.disposableCase

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.entry.update({
        where: { id },
        data: {
          caseCount: newCaseCount,
          weight: newWeight,
          weak: newWeak,
          disposableCase: newDisposable,
          bQuality: newBQuality,
        },
        include: {
          product: true,
          producer: true,
          quality: true,
          market: true,
          regionSession: { include: { region: true } },
        },
      })

      if (disposableChanged) {
        // Siyah kasa işaretlendi → bölge düşümü geri alınır (kasa hiç gelmemiş sayılır).
        // İşaret kaldırıldı → düşüm yeniden yazılır.
        // Yalnızca bayrak DEĞİŞTİĞİNDE dokunuluyor: bu özellikten önceki girişlerin
        // bağlı hareketi yok, onlara kendiliğinden hareket üretmek bölge bakiyesini
        // düzenleme sırasında beklenmedik şekilde oynatırdı.
        if (newDisposable) {
          await tx.caseMovement.deleteMany({ where: { entryId: id } })
        } else if (entry.regionSession?.regionId) {
          await tx.caseMovement.create({
            data: {
              type: 'REGION_IN',
              qty: trackedCases(row),
              regionId: entry.regionSession.regionId,
              entryId: id,
              createdBy: req.user?.name || req.user?.username || 'Sistem',
            },
          })
        }
      } else if (newCaseCount !== entry.caseCount) {
        // Kasa adedi değiştiyse bölge düşümü de değişmeli. updateMany kullanılıyor:
        // bu özellikten önceki girişlerin bağlı hareketi yok, sessizce atlanır.
        await tx.caseMovement.updateMany({
          where: { entryId: id },
          data: { qty: trackedCases(row) },
        })
      }

      // ÜRETİCİ BORCU SENKRONU. Kilo düzeltildiyse borç da düzelmeli; yoksa
      // "40 kg yazmışım, 35'ti" düzeltmesi stoku düzeltir ama borcu 40 kg
      // üzerinden bırakır ve üretici fazla para alır.
      //
      // FİYAT KAYDIN KENDİ SNAPSHOT'INDAN okunur, BUGÜNKÜ tablodan DEĞİL.
      // Düzeltme fiyatı da güncelleseydi üç gün önceki bir girişin tutarı, kasa
      // adedi düzeltilirken sessizce değişirdi — exitController.updateExit'teki
      // lockedPrices ile birebir aynı gerekçe.
      const snapPrice = entry.purchasePricePerKg
      if (entry.producerId && snapPrice != null) {
        const existingDebt = await tx.ledgerEntry.findUnique({ where: { entryId: id } })
        const amount = round2(snapPrice * newWeight)
        if (amount > 0) {
          if (existingDebt) {
            await tx.ledgerEntry.update({ where: { entryId: id }, data: { amount } })
          } else {
            // Snapshot var ama borç yok → backfill'den kalmış ya da borç elle
            // silinmiş. Düzeltme sırasında borcu doğurmak doğru davranış:
            // fiyatı bilinen bir mal kabulün karşılığı olmalı.
            await tx.ledgerEntry.create({
              data: {
                type: 'PRODUCER_DEBT',
                amount,
                producerId: entry.producerId,
                entryId: id,
                occurredAt: entry.createdAt,
                createdBy: req.user?.name || req.user?.username || 'Sistem',
                note: `Mal kabul #${id} · düzeltme ile oluştu`,
              },
            })
          }
        } else if (existingDebt) {
          await tx.ledgerEntry.delete({ where: { entryId: id } })
        }
        // Dökümdeki "alınan miktar" bu kolondan okunuyor — düzeltme onu da
        // taşımalı, yoksa "35 kg alındı · 40 kg'lık borç" çelişkisi çıkar.
        await tx.entry.update({ where: { id }, data: { purchaseQty: newWeight } })
      }
      return row
    })

    auditUpdate(req, 'entry', id, describeEntry(updated))
    res.json(updated)
  } catch (err) { next(err) }
}

// Admin/muhasebe: DEPOYA ELLE GİRİŞ.
//
// Saha akışı (createEntryBatch) aktif bölge oturumu şart koşuyor; ofisten
// yapılan düzeltmelerde öyle bir oturum yok. Bu uç oturumsuz, doğrudan depoya
// kayıt açar — atlanmış mal kabul, açılış stoğu, sayım farkı gibi durumlar için.
//
// KASA HAREKETİ YAZILMAZ: REGION_IN "şu bölgeye verilen kasa geri döndü"
// demektir; bölge oturumu olmayan kaydın hangi bölgenin kasasını düşeceği
// belli değil. Kasa düzeltmesi gerekiyorsa Kasa Takip ekranından elle girilir.
export async function createManualDepoEntry(req, res, next) {
  try {
    const { productId, caseCount, weight, qualityId, producerId, weak, disposableCase, bQuality } = req.body
    if (!productId) return res.status(400).json({ error: 'Ürün seçilmeli' })

    const depo = await findDepoMarket()
    if (!depo) return res.status(404).json({ error: 'DEPO market kaydı bulunamadı' })

    const product = await prisma.product.findUnique({
      where: { id: Number(productId) },
      select: { id: true, name: true, unit: true },
    })
    if (!product) return res.status(404).json({ error: 'Ürün bulunamadı' })
    const countable = isCountable(product.unit)

    // Bağ/adette miktar weight kolonunda ve tam sayı. Kasa her birimde girilir —
    // bağ/adette opsiyonel (0 olabilir), kiloda zorunlu.
    const c = caseCount == null || caseCount === '' ? 0 : Number(caseCount)
    const w = Number(weight)
    if (countable) {
      if (!Number.isInteger(w) || w < 1) {
        return res.status(400).json({ error: `${unitLabel(product.unit)} miktarı pozitif tam sayı olmalı` })
      }
      if (!Number.isInteger(c) || c < 0) {
        return res.status(400).json({ error: 'Kasa adedi 0 veya pozitif tam sayı olmalı' })
      }
    } else {
      if (!Number.isInteger(c) || c < 1) {
        return res.status(400).json({ error: 'Kasa adedi pozitif tam sayı olmalı' })
      }
      if (!Number.isFinite(w) || w <= 0) {
        return res.status(400).json({ error: 'Kilo pozitif olmalı' })
      }
    }

    // Alış fiyatı çözümü — saha akışıyla aynı kural, tek fark: bölge oturumu
    // olmadığı için prim ayrı sorguyla okunuyor.
    //
    // occurredAt kabul ediliyor: ofis girişi çoğu zaman GEÇMİŞE dönük bir
    // düzeltmedir (atlanmış mal kabul, sayım farkı) ve borç o güne, o günün
    // fiyatıyla yazılmalı. 90 günlük pencere — saha akışındaki 7 gün burada
    // dar kalır, bu uç zaten ADMIN/ACCOUNTING'e kapalı.
    const ledgerAt = clampClientTime(req.body.occurredAt, { maxPastMs: 90 * 24 * 60 * 60 * 1000 })
    const prid = producerId ? Number(producerId) : null
    let purchase = { pricePerKg: null, source: null, premiumPct: null }
    if (prid) {
      const prod = await prisma.producer.findUnique({
        where: { id: prid },
        select: { pricePremiumPct: true },
      })
      if (!prod) return res.status(404).json({ error: 'Üretici bulunamadı' })
      const map = await getPurchasePriceMap(toPriceDate(ledgerAt), [prid])
      purchase = purchasePriceOf(map, { productId: product.id, producerId: prid, premiumPct: prod.pricePremiumPct ?? 0 })
    }

    // TRANSACTION ŞART (eskiden düz create idi): artık para yazıyor. Entry
    // yazılıp borç yazılamazsa üretici parasını alamaz ve kimse fark etmez.
    const entry = await prisma.$transaction(async (tx) => {
      const row = await tx.entry.create({
        data: {
          regionSessionId: null, // ofis girişi — bölge oturumuna bağlı değil
          productId: product.id,
          producerId: prid,
          qualityId: qualityId ? Number(qualityId) : null,
          caseCount: c,
          weight: w,
          unit: product.unit,
          weak: Boolean(weak),
          disposableCase: Boolean(disposableCase),
          bQuality: Boolean(bQuality),
          source: 'HARVEST', // mal girişi — iade/imha değil
          marketId: depo.id,
          createdBy: req.user?.name || req.user?.username || 'Admin',
          purchasePricePerKg: purchase.pricePerKg,
          purchasePriceSource: purchase.source,
          purchaseQty: w,
        },
        include: { product: true, quality: true, producer: true, market: true },
      })

      // Saha akışıyla aynı kurallar: fiyat yoksa borç yok (0 değil), üretici
      // yoksa borç yok. Gerekçeler createEntryBatch'te yazılı.
      if (prid && purchase.pricePerKg != null) {
        const amount = round2(purchase.pricePerKg * w)
        if (amount > 0) {
          await tx.ledgerEntry.create({
            data: {
              type: 'PRODUCER_DEBT',
              amount,
              producerId: prid,
              entryId: row.id,
              occurredAt: ledgerAt,
              createdBy: req.user?.name || req.user?.username || 'Admin',
              note: `Elle depo girişi #${row.id} · ${product.name} · `
                + `${formatQty(w, product.unit)} × ${purchase.pricePerKg} TL`
                + (purchase.source === 'PRODUCER_PREMIUM' ? ` (prim %${purchase.premiumPct})` : '')
                + (purchase.source === 'PRODUCER_SPECIAL' ? ' (özel fiyat)' : ''),
            },
          })
        }
      }
      return row
    })

    auditCreate(req, 'entry', entry.id, `Elle depo girişi · ${describeEntry(entry)}`)
    res.status(201).json(entry)
  } catch (err) { next(err) }
}

export async function createEntryBatch(req, res, next) {
  // clientId try DIŞINDA: catch bloğu da okuyor (P2002 yarış durumu için).
  // Offline kuyruğun idempotency anahtarı. Online gönderimde de dolu gelir:
  // timeout alan istemci kaydı kuyruğa alıp AYNI anahtarla tekrar gönderiyor,
  // sunucu ilk isteği yazmışsa ikincisini yazmamalı (bkz. SyncedBatch).
  const { clientId } = req.body

  try {
    // weak ve disposableCase batch seviyesinde: tek ürün için N satır pazar
    // dağılımı giriliyor, ikisi de o partinin tamamına ait.
    const {
      regionSessionId, regionId, openedAt, productId, producerId, qualityId,
      weak, disposableCase, bQuality, entries,
    } = req.body

    // regionSessionId YA DA regionId: offline açılan bölgede oturum numarası
    // olmadığı için istemci bölgeyi gönderiyor, oturumu sunucu çözüyor
    // (bkz. resolveSessionForRegion).
    if ((!regionSessionId && !regionId) || !productId || !entries?.length) {
      return res.status(400).json({ error: 'Tüm alanlar zorunludur' })
    }

    // Bu batch daha önce işlendi mi? Ucuz ön kontrol — asıl garanti
    // transaction'daki PK ihlali (aşağıda), burası yalnızca boşa iş yapmamak için.
    if (clientId) {
      const seen = await prisma.syncedBatch.findUnique({ where: { clientId } })
      if (seen) return res.json({ alreadySynced: true, recordIds: seen.recordIds })
    }

    // İki yol: oturum numarası varsa (online akış) doğrudan okunur; yoksa
    // (offline açılan bölge) bölgeden çözülür.
    let session
    if (regionSessionId) {
      session = await prisma.regionSession.findUnique({
        where: { id: Number(regionSessionId) },
      })
      if (!session) {
        return res.status(400).json({ error: 'Bölge oturumu bulunamadı' })
      }
    } else {
      const region = await prisma.region.findUnique({
        where: { id: Number(regionId) },
        select: { id: true, active: true },
      })
      if (!region) return res.status(404).json({ error: 'Bölge bulunamadı' })
      if (!region.active) return res.status(400).json({ error: 'Pasif bölgeye giriş yapılamaz' })
      session = await resolveSessionForRegion(
        prisma,
        Number(regionId),
        openedAt ? new Date(openedAt) : null,
      )
      if (!session) return res.status(500).json({ error: 'Bölge oturumu açılamadı' })
    }
    // Oturum kapanmışsa normalde kayıt kabul edilmez. TEK İSTİSNA offline kuyruk:
    // operatör kesintide giriş yapar, bağlantı gelince bölgeyi tamamlar ve kuyruk
    // ondan SONRA boşalabilir (iOS'ta arka plan senkronu yok — iPad kilitliyse
    // kuyruk saatlerce bekler). Bu kaydı reddetmek malı yok saymak olurdu; mal
    // fiziksel olarak gelmiş.
    //
    // 24 saat sınırı: geçmiş oturumlara süresiz kayıt sızmasın. Bundan eskisi
    // reddedilir ve operatörün kuyruk panelinde görünür — elle girilecek.
    //
    // Pencere oturumun AÇILIŞINDAN (createdAt) sayılıyor: modelde completedAt
    // yok ve bir bölge oturumu aynı gün açılıp kapanıyor. Oturum bir günden uzun
    // açık kaldıysa offline kayıt reddedilir — bilinçli sıkı taraf.
    // Bu kontrol yalnızca OTURUM NUMARASIYLA gelen akışta anlamlı: bölgeden
    // çözülen oturum tanımı gereği zaten ACTIVE (yoksa yenisi açılıyor).
    const GRACE_MS = 24 * 60 * 60 * 1000
    if (regionSessionId && session.status !== 'ACTIVE') {
      const fresh = Date.now() - new Date(session.createdAt).getTime() < GRACE_MS
      if (!clientId || !fresh) {
        return res.status(400).json({ error: 'Aktif bölge oturumu bulunamadı' })
      }
    }

    let producer = null
    if (producerId) {
      const check = await validateProducerForSession(producerId, session)
      if (check.error) return res.status(400).json({ error: check.error })
      producer = check.producer
    }

    // Birim ürünün güncel ayarından okunur ve Entry'ye snapshot yazılır.
    const product = await prisma.product.findUnique({
      where: { id: Number(productId) },
      // name yalnızca denetim kaydının okunabilir olması için (bkz. auditCreate)
      select: { unit: true, name: true },
    })
    if (!product) return res.status(404).json({ error: 'Ürün bulunamadı' })
    const countable = isCountable(product.unit)

    for (const e of entries) {
      if (countable) {
        // Miktar weight kolonunda ve tam sayı olmalı — ondalık gelirse FIFO
        // Math.min(remaining, 12.5) ile kilitlenir. Kasa opsiyonel: mal kasayla
        // geldiyse sayılır (siyah kasa değilse), gelmediyse 0 kalır.
        if (!Number.isInteger(Number(e.weight)) || Number(e.weight) < 1) {
          return res.status(400).json({ error: `${unitLabel(product.unit)} miktarı en az 1 ve tam sayı olmalıdır` })
        }
        if (e.caseCount != null && e.caseCount !== '' && Number(e.caseCount) < 0) {
          return res.status(400).json({ error: 'Kasa adedi negatif olamaz' })
        }
      } else {
        if (!e.caseCount || Number(e.caseCount) < 1) {
          return res.status(400).json({ error: 'Kasa adedi en az 1 olmalıdır' })
        }
        if (!e.weight || Number(e.weight) <= 0) {
          return res.status(400).json({ error: 'Kilo sıfırdan büyük olmalıdır' })
        }
      }
      if (!e.marketId) {
        return res.status(400).json({ error: 'Her satır için pazar seçilmeli' })
      }
    }

    const createdBy = req.user?.name || req.user?.username || 'Sistem'

    // Doğrudan 99 ATILAN'a yazılan mal imha edilmiştir; source DISCARD olmalı.
    // Eskiden HARVEST kalıyordu: fire raporu (source=DISCARD filtreli) bu malı
    // hiç görmüyor, günlük/analitik raporlar ise mal kabul hacmine sayıyordu —
    // yani imha edilen mal iki yerde birden yanlış görünüyordu.
    // Depo transferiyle 99'a gidiş zaten DISCARD yazıyor (transferController).
    const marketIds = [...new Set(entries.map((e) => Number(e.marketId)))]
    const marketRows = await prisma.market.findMany({
      where: { id: { in: marketIds } },
      select: { id: true, no: true },
    })
    if (marketRows.length !== marketIds.length) {
      return res.status(404).json({ error: 'Seçilen pazarlardan biri bulunamadı' })
    }
    const discardMarketIds = new Set(
      marketRows.filter((m) => m.no === DISCARD_NO).map((m) => m.id)
    )

    // ——— ÜRETİCİ BORCU: alış fiyatı çözümü ———
    //
    // Cari hesabın GERÇEK zamanı. Offline kuyrukta bekleyen parti saatler sonra
    // gönderilebiliyor; sync anını yazmak borcu yanlış güne düşürür VE o günün
    // alış fiyatıyla hesaplar. İade akışı bu dersi zaten öğrendi.
    // Entry.createdAt'e DOKUNULMUYOR — o yazım anıdır ve tüm raporlar ona bağlı.
    const ledgerAt = clampClientTime(req.body.occurredAt)

    // Fiyat transaction DIŞINDA çözülüyor (exitController.createExit ile aynı
    // gerekçe): transaction içinde sorgu açmak kilit süresini uzatır ve mal
    // kabul saha akışının en sıcak noktası.
    //
    // Parti tek ürün + tek üretici olduğu için TEK çözüm tüm satırlara uygulanır.
    const purchaseMap = await getPurchasePriceMap(
      toPriceDate(ledgerAt),
      producerId ? [Number(producerId)] : [],
    )
    const purchase = purchasePriceOf(purchaseMap, {
      productId: Number(productId),
      producerId: producerId ? Number(producerId) : null,
      premiumPct: producer?.pricePremiumPct ?? 0,
    })

    // $transaction kalır: çok satır, all-or-nothing olmalı
    const created = await prisma.$transaction(async (tx) => {
      // İLK ADIM idempotency kaydı: PK ihlali burada patlarsa hiçbir satır
      // yazılmaz. Yarış durumu böyle kapanıyor — retry'ın iki isteği aynı anda
      // gelse bile ikincisi bu INSERT'te duruyor.
      if (clientId) {
        await tx.syncedBatch.create({
          data: { clientId, kind: 'ENTRY_BATCH', recordIds: [], createdBy },
        })
      }
      const results = []
      for (const e of entries) {
        const entry = await tx.entry.create({
          data: {
            regionSessionId: session.id,   // çözülen oturum (offline'da bölgeden gelmiş olabilir)
            productId: Number(productId),
            producerId: producerId ? Number(producerId) : null,
            qualityId: qualityId ? Number(qualityId) : null,
            caseCount: e.caseCount == null || e.caseCount === '' ? 0 : Number(e.caseCount),
            weight: Number(e.weight),
            unit: product.unit,
            weak: Boolean(weak),
            // Siyah kasa ve B kalite SATIR BAZINDA gelebilir (2026-08-18): aynı
            // partide bir pazara siyah kasayla, diğerine normal kasayla mal
            // gidebiliyor. Satır değeri yoksa parti geneli uygulanır — eski
            // istemciler bu alanları hiç göndermiyor, onlar için davranış aynı.
            disposableCase: typeof e.disposableCase === 'boolean'
              ? e.disposableCase
              : Boolean(disposableCase),
            bQuality: typeof e.bQuality === 'boolean' ? e.bQuality : Boolean(bQuality),
            source: discardMarketIds.has(Number(e.marketId)) ? 'DISCARD' : 'HARVEST',
            marketId: Number(e.marketId),
            createdBy,
            // Alış SNAPSHOT'ı — ExitItem.pricePerKg ile aynı gerekçe: alış
            // fiyatı sonradan değişse de bu satırın maliyeti sabit kalır.
            purchasePricePerKg: purchase.pricePerKg,
            purchasePriceSource: purchase.source,
            // Mal kabul anındaki miktar. weight sonradan depo transferinde
            // yeniden tartılıp DEĞİŞEBİLİYOR — borç oradan türetilemez.
            purchaseQty: Number(e.weight),
          },
        })

        // ÜRETİCİ BORCU — mal kabul anında doğar (2026-08-26 kararı: iş modeli
        // alım-satım/tüccarlık, komisyonculuk değil; mal üreticiden AYRI bir
        // alış fiyatıyla alınıyor ve bayiye kesilen irsaliye fiyatından
        // tamamen bağımsız).
        //
        // FİLTRE YOK — bilinçli: 99 ATILAN'a giden, weak işaretli ve siyah
        // kasadaki mal da borç yazar ("fire de ödenir" kararı). source/weak/
        // disposableCase'e bakan bir koşul eklenirse üretici malının bir
        // kısmının parasını alamaz.
        //
        // FİYAT YOKSA BORÇ YAZILMAZ, 0 yazılmaz: sıfır "bedava aldık" demek,
        // bulunamamak "muhasebeci girmedi" demek (utils/prices.js:23-24).
        // Bu satırlar fiyatsız-mal-kabul uyarı listesinde birikir.
        //
        // ÜRETİCİ YOKSA BORÇ YAZILMAZ: kime borçlu olduğumuz belli değil.
        // Üretici sonradan atanınca borç doğar (PATCH /admin/entries/:id/producer).
        if (producerId && purchase.pricePerKg != null) {
          const amount = round2(purchase.pricePerKg * Number(e.weight))
          if (amount > 0) {
            await tx.ledgerEntry.create({
              data: {
                type: 'PRODUCER_DEBT',
                amount,
                producerId: Number(producerId),
                // entryId @unique + Cascade: aynı girişe ikinci borç fiziksel
                // olarak imkânsız, giriş silinirse borç da düşer.
                entryId: entry.id,
                occurredAt: ledgerAt,
                createdBy,
                note: `Mal kabul #${entry.id} · ${product.name} · `
                  + `${formatQty(e.weight, product.unit)} × ${purchase.pricePerKg} TL`
                  + (purchase.source === 'PRODUCER_PREMIUM' ? ` (prim %${purchase.premiumPct})` : '')
                  + (purchase.source === 'PRODUCER_SPECIAL' ? ' (özel fiyat)' : ''),
              },
            })
          }
        }
        // Mal geldi = bölgeye verilen kasa döndü. Giriş başına tek hareket:
        // entryId unique + cascade, böylece giriş silinince düşüm de kalkar.
        // Siyah/karton kasada gelen mal için hareket HİÇ yazılmaz — o kasa
        // bölgeye verilmemişti, geri dönmüş de sayılmaz.
        const qty = trackedCases(entry)
        if (qty > 0) {
          await tx.caseMovement.create({
            data: {
              type: 'REGION_IN',
              qty,
              regionId: session.regionId,
              entryId: entry.id,
              createdBy,
            },
          })
        }
        results.push(entry)
      }

      // Yazılan id'leri idempotency kaydına işle: aynı clientId tekrar gelirse
      // ne yazdığımızı söyleyebilelim (yukarıdaki ön kontrol bunu döndürüyor).
      if (clientId) {
        await tx.syncedBatch.update({
          where: { clientId },
          data: { recordIds: results.map((r) => r.id) },
        })
      }
      return results
    })

    // Parti tek satır olarak loglanıyor: 20 satırlık mal kabul 20 log üretirse
    // denetim ekranı okunmaz hale gelir. recordCount kaç satır olduğunu söyler.
    auditCreate(
      req, 'entry', created[0]?.id ?? null,
      `Mal kabul · ${created.length} satır · ${product?.name ?? ''}`.trim(),
      created.length,
    )
    res.status(201).json(created)
  } catch (err) {
    // Eşzamanlı retry: aynı clientId'yi iki istek birden yazmaya çalıştı.
    // Kaybeden taraf hata değil, "zaten yazıldı" görmeli — yoksa istemci kalemi
    // REJECTED işaretler ve operatöre sahte hata gösterilir.
    if (clientId && err?.code === 'P2002') {
      const seen = await prisma.syncedBatch.findUnique({ where: { clientId } })
      return res.json({ alreadySynced: true, recordIds: seen?.recordIds ?? [] })
    }
    next(err)
  }
}
