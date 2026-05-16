import { prisma } from '../utils/prismaClient.js'
import { getPriceMap } from './priceController.js'

function dayRange(dateStr) {
  if (dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number)
    return {
      start: new Date(y, m - 1, d, 0, 0, 0, 0),
      end:   new Date(y, m - 1, d, 23, 59, 59, 999),
    }
  }
  const now = new Date()
  return {
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
    end:   new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
  }
}

export async function dailyReport(req, res, next) {
  try {
    const { start, end } = dayRange(req.query.date)

    const [entrySummary, exitCount] = await Promise.all([
      prisma.entry.aggregate({
        where: { createdAt: { gte: start, lte: end } },
        _sum: { caseCount: true, weight: true },
        _count: { id: true },
      }),
      prisma.exit.count({ where: { createdAt: { gte: start, lte: end } } }),
    ])

    res.json({
      date: start.toLocaleDateString('tr-TR'),
      totalEntries: entrySummary._count.id,
      totalCases: entrySummary._sum.caseCount ?? 0,
      totalWeight: entrySummary._sum.weight ?? 0,
      totalExits: exitCount,
    })
  } catch (err) { next(err) }
}

export async function byMarketReport(req, res, next) {
  try {
    const { start, end } = dayRange(req.query.date)

    const grouped = await prisma.entry.groupBy({
      by: ['marketId'],
      where: { createdAt: { gte: start, lte: end } },
      _sum: { caseCount: true, weight: true },
      _count: { id: true },
    })

    const marketIds = grouped.map((g) => g.marketId)
    const markets = await prisma.market.findMany({
      where: { id: { in: marketIds } },
      orderBy: { no: 'asc' },
    })
    const marketMap = Object.fromEntries(markets.map((m) => [m.id, m]))

    const result = grouped
      .map((g) => ({
        market: marketMap[g.marketId],
        totalEntries: g._count.id,
        totalCases: g._sum.caseCount ?? 0,
        totalWeight: g._sum.weight ?? 0,
      }))
      .sort((a, b) => (a.market?.no ?? 0) - (b.market?.no ?? 0))

    res.json(result)
  } catch (err) { next(err) }
}

export async function byProductReport(req, res, next) {
  try {
    const { start, end } = dayRange(req.query.date)

    const grouped = await prisma.entry.groupBy({
      by: ['productId', 'qualityId'],
      where: { createdAt: { gte: start, lte: end } },
      _sum: { caseCount: true, weight: true },
      _count: { id: true },
    })

    if (!grouped.length) return res.json([])

    const productIds = [...new Set(grouped.map((g) => g.productId))]
    const qualityIds = [...new Set(grouped.map((g) => g.qualityId))]
    const [products, qualities] = await Promise.all([
      prisma.product.findMany({ where: { id: { in: productIds } } }),
      prisma.quality.findMany({ where: { id: { in: qualityIds } } }),
    ])
    const productMap = Object.fromEntries(products.map((p) => [p.id, p]))
    const qualityMap = Object.fromEntries(qualities.map((q) => [q.id, q]))

    // Fiyat map'ini getir
    const priceMap = await getPriceMap(start)

    const result = grouped
      .map((g) => {
        const pricePerKg = priceMap[`${g.productId}_${g.qualityId}`] ?? null
        const totalWeight = g._sum.weight ?? 0
        return {
          product: productMap[g.productId],
          quality: qualityMap[g.qualityId],
          totalEntries: g._count.id,
          totalCases: g._sum.caseCount ?? 0,
          totalWeight,
          pricePerKg,
          totalRevenue: pricePerKg !== null ? pricePerKg * totalWeight : null,
        }
      })
      .sort((a, b) => b.totalWeight - a.totalWeight)

    res.json(result)
  } catch (err) { next(err) }
}

export async function topProducts(req, res, next) {
  try {
    const days = Math.min(Math.max(Number(req.query.days ?? 7), 1), 365)
    const limit = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 100)
    const now = new Date()
    const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 0, 0, 0, 0)

    const grouped = await prisma.entry.groupBy({
      by: ['productId'],
      where: { createdAt: { gte: since } },
      _sum: { caseCount: true, weight: true },
      _count: { id: true },
      orderBy: { _sum: { weight: 'desc' } },
      take: limit,
    })

    const productIds = grouped.map((g) => g.productId)
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    })
    const productMap = Object.fromEntries(products.map((p) => [p.id, p]))

    const result = grouped.map((g) => ({
      product: productMap[g.productId],
      totalEntries: g._count.id,
      totalCases: g._sum.caseCount ?? 0,
      totalWeight: g._sum.weight ?? 0,
    }))

    res.json(result)
  } catch (err) { next(err) }
}
