import { prisma } from '../utils/prismaClient.js'
import { getPriceMap } from './priceController.js'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

function parsePagination(req) {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT))
  return { page, limit, skip: (page - 1) * limit }
}

// Tüm irsaliyeleri getir (filtre: tarih, market) — paginated
export async function getExitHistory(req, res, next) {
  try {
    const { date, marketId } = req.query
    const { page, limit, skip } = parsePagination(req)
    const where = {}

    if (date) {
      const [y, m, d] = date.split('-').map(Number)
      where.createdAt = { gte: new Date(y, m - 1, d, 0, 0, 0, 0), lte: new Date(y, m - 1, d, 23, 59, 59, 999) }
    }
    if (marketId) where.marketId = Number(marketId)

    const [exits, total] = await Promise.all([
      prisma.exit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
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
      }),
      prisma.exit.count({ where }),
    ])

    // Unique tarihler için fiyat map'lerini paralel çek
    const uniqueDates = [...new Set(exits.map((e) => e.createdAt.toISOString().split('T')[0]))]
    const priceMaps = {}
    await Promise.all(
      uniqueDates.map(async (d) => { priceMaps[d] = await getPriceMap(new Date(d)) })
    )

    const data = exits.map((ex) => {
      const priceMap = priceMaps[ex.createdAt.toISOString().split('T')[0]] ?? {}
      const itemsWithPrice = ex.items.map((item) => {
        const key = `${item.entry.productId}_${item.entry.qualityId}`
        // Snapshot önceliği — ExitItem.pricePerKg saklı varsa onu kullan
        const pricePerKg = item.pricePerKg != null ? item.pricePerKg : (priceMap[key] ?? null)
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
        drivers: [...new Set(ex.items.map((i) => i.entry.vehicleSession?.driver?.name).filter(Boolean))],
        items: itemsWithPrice,
      }
    })

    res.json({ data, total, page, limit, hasMore: skip + data.length < total })
  } catch (err) { next(err) }
}

// Tüm giriş kayıtları — paginated
export async function getEntryHistory(req, res, next) {
  try {
    const { date, driverId, marketId } = req.query
    const { page, limit, skip } = parsePagination(req)
    const where = {}

    if (date) {
      const [y, m, d] = date.split('-').map(Number)
      where.createdAt = { gte: new Date(y, m - 1, d, 0, 0, 0, 0), lte: new Date(y, m - 1, d, 23, 59, 59, 999) }
    }
    if (driverId) where.vehicleSession = { driverId: Number(driverId) }
    if (marketId) where.marketId = Number(marketId)

    const [entries, total] = await Promise.all([
      prisma.entry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          product: true,
          producer: true,
          quality: true,
          market: true,
          vehicleSession: { include: { driver: true } },
          exitItems: { include: { exit: true } },
        },
      }),
      prisma.entry.count({ where }),
    ])

    const data = entries.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      driver: e.vehicleSession?.driver ?? null,
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
    }))

    res.json({ data, total, page, limit, hasMore: skip + data.length < total })
  } catch (err) { next(err) }
}
