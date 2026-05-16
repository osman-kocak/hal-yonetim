import { prisma } from '../utils/prismaClient.js'

export async function getMarkets(req, res, next) {
  try {
    const markets = await prisma.market.findMany({
      orderBy: { no: 'asc' },
      include: {
        _count: {
          select: {
            entries: {
              where: { exitItems: { none: {} } },
            },
          },
        },
      },
    })

    const result = markets.map((m) => ({
      id: m.id,
      no: m.no,
      name: m.name,
      pendingCount: m._count.entries,
    }))

    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function getMarketEntries(req, res, next) {
  try {
    const { id } = req.params

    const entries = await prisma.entry.findMany({
      where: {
        marketId: Number(id),
        exitItems: { none: {} },
      },
      include: {
        product: true,
        quality: true,
        market: true,
        vehicleSession: { include: { driver: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json(entries)
  } catch (err) {
    next(err)
  }
}
