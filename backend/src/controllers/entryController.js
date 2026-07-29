import { prisma } from '../utils/prismaClient.js'

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
    const { caseCount, weight, marketId, weak } = req.body

    const entry = await prisma.entry.findUnique({
      where: { id },
      include: { exitItems: { select: { id: true } } },
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

    if (!Number.isInteger(newCaseCount) || newCaseCount < 1) {
      return res.status(400).json({ error: 'Kasa adedi pozitif tam sayı olmalı' })
    }
    if (!Number.isFinite(newWeight) || newWeight <= 0) {
      return res.status(400).json({ error: 'Ağırlık pozitif olmalı' })
    }

    const updated = await prisma.entry.update({
      where: { id },
      data: { caseCount: newCaseCount, weight: newWeight, weak: newWeak },
      include: {
        product: true,
        producer: true,
        quality: true,
        market: true,
        regionSession: { include: { region: true } },
      },
    })

    res.json(updated)
  } catch (err) { next(err) }
}

export async function createEntryBatch(req, res, next) {
  try {
    const { regionSessionId, productId, producerId, qualityId, weak, entries } = req.body

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

    for (const e of entries) {
      if (!e.caseCount || Number(e.caseCount) < 1) {
        return res.status(400).json({ error: 'Kasa adedi en az 1 olmalıdır' })
      }
      if (!e.weight || Number(e.weight) <= 0) {
        return res.status(400).json({ error: 'Kilo sıfırdan büyük olmalıdır' })
      }
      if (!e.marketId) {
        return res.status(400).json({ error: 'Her satır için pazar seçilmeli' })
      }
    }

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
            caseCount: Number(e.caseCount),
            weight: Number(e.weight),
            weak: Boolean(weak),
            marketId: Number(e.marketId),
          },
        })
        results.push(entry)
      }
      return results
    })

    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
}
