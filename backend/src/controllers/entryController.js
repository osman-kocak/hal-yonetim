import { prisma } from '../utils/prismaClient.js'

export async function createEntry(req, res, next) {
  try {
    const { vehicleSessionId, productId, producerId, qualityId, caseCount, weight, marketId } = req.body

    if (!vehicleSessionId || !productId || !caseCount || !weight || !marketId) {
      return res.status(400).json({ error: 'Tüm alanlar zorunludur' })
    }
    if (Number(caseCount) < 1) {
      return res.status(400).json({ error: 'Kasa adedi en az 1 olmalıdır' })
    }
    if (Number(weight) <= 0) {
      return res.status(400).json({ error: 'Kilo sıfırdan büyük olmalıdır' })
    }

    const session = await prisma.vehicleSession.findUnique({
      where: { id: Number(vehicleSessionId) },
    })
    if (!session || session.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Aktif araç oturumu bulunamadı' })
    }

    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.entry.create({
        data: {
          vehicleSessionId: Number(vehicleSessionId),
          productId: Number(productId),
          producerId: producerId ? Number(producerId) : null,
          qualityId: qualityId ? Number(qualityId) : null,
          caseCount: Number(caseCount),
          weight: Number(weight),
          marketId: Number(marketId),
        },
        include: {
          product: true,
          producer: true,
          quality: true,
          market: true,
          vehicleSession: { include: { driver: true } },
        },
      })
      // Otomatik: şoför bakiyesinden kasa düş (DRIVER_IN, sign -1)
      await tx.caseMovement.create({
        data: {
          type: 'DRIVER_IN',
          qty: Number(caseCount),
          driverId: session.driverId,
          note: `Mal kabul - Entry #${created.id}`,
          createdBy: req.user?.name || req.user?.username || 'Operatör',
        },
      })
      return created
    })

    res.status(201).json(entry)
  } catch (err) {
    next(err)
  }
}

// Entry sil: exit edilmemişse OK. Bağlı DRIVER_IN movement'ı da silinir.
export async function deleteEntry(req, res, next) {
  try {
    const id = Number(req.params.id)
    const entry = await prisma.entry.findUnique({
      where: { id },
      include: { exitItems: true, vehicleSession: true },
    })
    if (!entry) return res.status(404).json({ error: 'Giriş bulunamadı' })
    if (entry.exitItems.length > 0) {
      return res.status(409).json({ error: 'Bu giriş irsaliye edilmiş, silinemez' })
    }

    await prisma.$transaction(async (tx) => {
      // Otomatik DRIVER_IN movement (varsa) düş
      if (entry.vehicleSession) {
        await tx.caseMovement.deleteMany({
          where: {
            type: 'DRIVER_IN',
            driverId: entry.vehicleSession.driverId,
            note: `Mal kabul - Entry #${entry.id}`,
          },
        })
      }
      await tx.entry.delete({ where: { id } })
    })

    res.status(204).end()
  } catch (err) { next(err) }
}

// Entry güncelle: kasa/kg/zayıf düzenleyebilir. exit edilmişse reddedilir. marketId değiştirilemez (transfer kullanılsın).
// caseCount değişirse otomatik DRIVER_IN CaseMovement'ı da güncellenir (sync).
export async function updateEntry(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { caseCount, weight, marketId, weak } = req.body

    const entry = await prisma.entry.findUnique({
      where: { id },
      include: { exitItems: true, vehicleSession: true },
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

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.entry.update({
        where: { id },
        data: { caseCount: newCaseCount, weight: newWeight, weak: newWeak },
        include: { product: true, producer: true, quality: true, market: true, vehicleSession: { include: { driver: true } } },
      })

      // Kasa adedi değiştiyse + vehicleSession varsa (iade entry'lerinde session null olabilir)
      if (newCaseCount !== entry.caseCount && entry.vehicleSession) {
        const auto = await tx.caseMovement.findFirst({
          where: {
            type: 'DRIVER_IN',
            driverId: entry.vehicleSession.driverId,
            note: `Mal kabul - Entry #${entry.id}`,
          },
        })
        if (auto) {
          await tx.caseMovement.update({
            where: { id: auto.id },
            data: { qty: newCaseCount },
          })
        }
      }
      return u
    })

    res.json(updated)
  } catch (err) { next(err) }
}

export async function createEntryBatch(req, res, next) {
  try {
    const { vehicleSessionId, productId, producerId, qualityId, weak, entries } = req.body

    if (!vehicleSessionId || !productId || !entries?.length) {
      return res.status(400).json({ error: 'Tüm alanlar zorunludur' })
    }

    const session = await prisma.vehicleSession.findUnique({
      where: { id: Number(vehicleSessionId) },
    })
    if (!session || session.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Aktif araç oturumu bulunamadı' })
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

    const createdBy = req.user?.name || req.user?.username || 'Operatör'
    const created = await prisma.$transaction(async (tx) => {
      const results = []
      for (const e of entries) {
        const entry = await tx.entry.create({
          data: {
            vehicleSessionId: Number(vehicleSessionId),
            productId: Number(productId),
            producerId: producerId ? Number(producerId) : null,
            qualityId: qualityId ? Number(qualityId) : null,
            caseCount: Number(e.caseCount),
            weight: Number(e.weight),
            weak: Boolean(weak),
            marketId: Number(e.marketId),
          },
        })
        await tx.caseMovement.create({
          data: {
            type: 'DRIVER_IN',
            qty: Number(e.caseCount),
            driverId: session.driverId,
            note: `Mal kabul - Entry #${entry.id}`,
            createdBy,
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
