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

    const entry = await prisma.entry.create({
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

    res.status(201).json(entry)
  } catch (err) {
    next(err)
  }
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

    const created = await prisma.$transaction(
      entries.map((e) =>
        prisma.entry.create({
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
      )
    )

    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
}
