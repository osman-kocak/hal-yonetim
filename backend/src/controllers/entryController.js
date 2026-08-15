import { prisma } from '../utils/prismaClient.js'
import { trackedCases } from '../utils/cases.js'
import { isCountable, unitLabel } from '../utils/units.js'
import { DISCARD_NO, findDepoMarket } from '../utils/markets.js'

// Üretici bu oturumda kullanılabilir mi? Hata mesajı döner, uygunsa null.
// Arayüz zaten bölgenin listesini gösteriyor; bu, sınırdaki savunma:
// yanlış eşleşen giriş bölge raporlarına sessizce yanlış yazılırdı.
async function validateProducerForSession(producerId, session) {
  const producer = await prisma.producer.findUnique({
    where: { id: Number(producerId) },
    select: { active: true, regionId: true, allRegions: true },
  })
  if (!producer) return 'Üretici bulunamadı'
  if (!producer.active) return 'Pasif üreticiye giriş yapılamaz'
  // allRegions üreticisi her bölgede geçerli.
  // regionId null olan üretici hiçbir bölge listesinde çıkmaz → giriş de yapılamaz.
  if (!producer.allRegions && producer.regionId !== session.regionId) {
    return 'Bu üretici seçilen bölgeye ait değil'
  }
  return null
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

    await prisma.entry.delete({ where: { id } })

    res.status(204).end()
  } catch (err) { next(err) }
}

// Entry güncelle: kasa/kg/zayıf düzenleyebilir. exit edilmişse reddedilir. marketId değiştirilemez (transfer kullanılsın).
export async function updateEntry(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { caseCount, weight, marketId, weak, disposableCase } = req.body

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
      return row
    })

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
    const { productId, caseCount, weight, qualityId, producerId, weak, disposableCase } = req.body
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

    const entry = await prisma.entry.create({
      data: {
        regionSessionId: null, // ofis girişi — bölge oturumuna bağlı değil
        productId: product.id,
        producerId: producerId ? Number(producerId) : null,
        qualityId: qualityId ? Number(qualityId) : null,
        caseCount: c,
        weight: w,
        unit: product.unit,
        weak: Boolean(weak),
        disposableCase: Boolean(disposableCase),
        source: 'HARVEST', // mal girişi — iade/imha değil
        marketId: depo.id,
        createdBy: req.user?.name || req.user?.username || 'Admin',
      },
      include: { product: true, quality: true, producer: true, market: true },
    })

    res.status(201).json(entry)
  } catch (err) { next(err) }
}

export async function createEntryBatch(req, res, next) {
  try {
    // weak ve disposableCase batch seviyesinde: tek ürün için N satır pazar
    // dağılımı giriliyor, ikisi de o partinin tamamına ait.
    const {
      regionSessionId, productId, producerId, qualityId, weak, disposableCase, entries,
    } = req.body

    if (!regionSessionId || !productId || !entries?.length) {
      return res.status(400).json({ error: 'Tüm alanlar zorunludur' })
    }

    const session = await prisma.regionSession.findUnique({
      where: { id: Number(regionSessionId) },
    })
    if (!session || session.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Aktif bölge oturumu bulunamadı' })
    }

    if (producerId) {
      const err = await validateProducerForSession(producerId, session)
      if (err) return res.status(400).json({ error: err })
    }

    // Birim ürünün güncel ayarından okunur ve Entry'ye snapshot yazılır.
    const product = await prisma.product.findUnique({
      where: { id: Number(productId) },
      select: { unit: true },
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

    // $transaction kalır: çok satır, all-or-nothing olmalı
    const created = await prisma.$transaction(async (tx) => {
      const results = []
      for (const e of entries) {
        const entry = await tx.entry.create({
          data: {
            regionSessionId: Number(regionSessionId),
            productId: Number(productId),
            producerId: producerId ? Number(producerId) : null,
            qualityId: qualityId ? Number(qualityId) : null,
            caseCount: e.caseCount == null || e.caseCount === '' ? 0 : Number(e.caseCount),
            weight: Number(e.weight),
            unit: product.unit,
            weak: Boolean(weak),
            disposableCase: Boolean(disposableCase),
            source: discardMarketIds.has(Number(e.marketId)) ? 'DISCARD' : 'HARVEST',
            marketId: Number(e.marketId),
            createdBy,
          },
        })
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
      return results
    })

    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
}
