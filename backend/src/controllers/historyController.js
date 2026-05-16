import { prisma } from '../utils/prismaClient.js'
import { getPriceMap } from './priceController.js'

// Tüm irsaliyeleri getir (filtre: tarih, market)
export async function getExitHistory(req, res, next) {
  try {
    const { date, marketId } = req.query
    const where = {}

    if (date) {
      const [y, m, d] = date.split('-').map(Number)
      where.createdAt = { gte: new Date(y, m - 1, d, 0, 0, 0, 0), lte: new Date(y, m - 1, d, 23, 59, 59, 999) }
    }
    if (marketId) where.marketId = Number(marketId)

    const exits = await prisma.exit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        market: true,
        items: {
          include: {
            entry: {
              include: {
                product: true,
                producer: true,
                quality: true,
                vehicleSession: { include: { driver: true } },
              },
            },
          },
        },
      },
    })

    // Unique tarihler için fiyat map'lerini paralel çek
    const uniqueDates = [...new Set(exits.map((e) => e.createdAt.toISOString().split('T')[0]))]
    const priceMaps = {}
    await Promise.all(
      uniqueDates.map(async (d) => { priceMaps[d] = await getPriceMap(new Date(d)) })
    )

    const result = exits.map((ex) => {
      const priceMap = priceMaps[ex.createdAt.toISOString().split('T')[0]] ?? {}
      const itemsWithPrice = ex.items.map((item) => {
        const key = `${item.entry.productId}_${item.entry.qualityId}`
        const pricePerKg = priceMap[key] ?? null
        const totalPrice = pricePerKg !== null ? pricePerKg * item.entry.weight : null
        return { ...item, pricePerKg, totalPrice }
      })
      return {
        id: ex.id,
        createdAt: ex.createdAt,
        createdBy: ex.createdBy,
        editedAt: ex.editedAt,
        editedBy: ex.editedBy,
        market: ex.market,
        itemCount: ex.items.length,
        totalCases: ex.items.reduce((s, i) => s + i.entry.caseCount, 0),
        totalWeight: ex.items.reduce((s, i) => s + i.entry.weight, 0),
        drivers: [...new Set(ex.items.map((i) => i.entry.vehicleSession.driver.name))],
        items: itemsWithPrice,
      }
    })

    res.json(result)
  } catch (err) { next(err) }
}

// Tüm giriş kayıtları (kim girdi, ne zaman, hangi araç)
export async function getEntryHistory(req, res, next) {
  try {
    const { date, driverId, marketId } = req.query
    const where = {}

    if (date) {
      const [y, m, d] = date.split('-').map(Number)
      where.createdAt = { gte: new Date(y, m - 1, d, 0, 0, 0, 0), lte: new Date(y, m - 1, d, 23, 59, 59, 999) }
    }
    if (driverId) where.vehicleSession = { driverId: Number(driverId) }
    if (marketId) where.marketId = Number(marketId)

    const entries = await prisma.entry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        product: true,
        producer: true,
        quality: true,
        market: true,
        vehicleSession: { include: { driver: true } },
        exitItems: { include: { exit: true } },
      },
    })

    res.json(entries.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      driver: e.vehicleSession.driver,
      sessionId: e.vehicleSessionId,
      product: e.product,
      producer: e.producer,
      quality: e.quality,
      market: e.market,
      caseCount: e.caseCount,
      weight: e.weight,
      weak: e.weak,
      exitedAt: e.exitItems[0]?.exit?.createdAt ?? null,
      irsaliyeId: e.exitItems[0]?.exitId ?? null,
    })))
  } catch (err) { next(err) }
}
