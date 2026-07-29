import { prisma } from '../utils/prismaClient.js'
import { getPriceMap } from './priceController.js'
import { toPriceDate, startOfLocalDay, endOfLocalDay } from '../utils/date.js'

// Raporlar sadece gerçek mal kabulünü sayar. İade ve imha entry'leri de
// Entry tablosunda durduğu için filtresiz toplamak çift sayıma yol açıyordu:
// Pazar 3'e giden 180 kg iade gelince günlük rapor 360 kg gösteriyordu.
const HARVEST_ONLY = { source: 'HARVEST' }

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
        where: { createdAt: { gte: start, lte: end }, ...HARVEST_ONLY },
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
      where: { createdAt: { gte: start, lte: end }, ...HARVEST_ONLY },
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
      where: { createdAt: { gte: start, lte: end }, ...HARVEST_ONLY },
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

    // start yerel gün başı (TR gece yarısı = UTC 21:00, önceki gün). Doğrudan
    // getPriceMap'e verilince Price.date UTC gün başına yuvarlanıp bir gün
    // geriye kayıyor ve rapor dünün fiyatlarıyla ciro hesaplıyordu.
    const priceMap = await getPriceMap(toPriceDate(req.query.date))

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
      where: { createdAt: { gte: since }, ...HARVEST_ONLY },
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

// Fire/imha raporu — 99 ATILAN'a yazılan mallar. Bu rapor 99'un varlık
// sebebi: eskiden imha edilen mal hiçbir yere kaydedilmiyordu, "bu ay ne
// kadar fire verdik" sorusunun cevabı yoktu.
export async function fireReport(req, res, next) {
  try {
    const { dateFrom, dateTo } = req.query
    const createdAt = {}
    if (dateFrom) {
      const from = startOfLocalDay(dateFrom)
      if (!from) return res.status(400).json({ error: 'dateFrom geçersiz' })
      createdAt.gte = from
    }
    if (dateTo) {
      const to = endOfLocalDay(dateTo)
      if (!to) return res.status(400).json({ error: 'dateTo geçersiz' })
      createdAt.lte = to
    }
    const dateFilter = Object.keys(createdAt).length ? { createdAt } : {}

    const grouped = await prisma.entry.groupBy({
      by: ['productId'],
      where: { source: 'DISCARD', ...dateFilter },
      _sum: { caseCount: true, weight: true },
      _count: { id: true },
      orderBy: { _sum: { weight: 'desc' } },
    })

    const products = await prisma.product.findMany({
      where: { id: { in: grouped.map((g) => g.productId) } },
    })
    const productMap = Object.fromEntries(products.map((p) => [p.id, p]))

    // Parasal karşılık ReturnRecord'da: bayiden gelip imha edilen malın
    // borçtan düşülen tutarı. Depodan dökülen malın iade kaydı yoktur → 0.
    const returns = await prisma.returnRecord.findMany({
      where: { discarded: true, ...dateFilter },
      select: { productId: true, amount: true },
    })
    const amountByProduct = {}
    for (const r of returns) {
      amountByProduct[r.productId] = (amountByProduct[r.productId] ?? 0) + r.amount
    }

    const round2 = (n) => Math.round(n * 100) / 100
    const items = grouped.map((g) => ({
      product: productMap[g.productId],
      entryCount: g._count.id,
      totalCases: g._sum.caseCount ?? 0,
      totalWeight: round2(g._sum.weight ?? 0),
      amount: round2(amountByProduct[g.productId] ?? 0),
    }))

    res.json({
      items,
      totals: {
        cases: items.reduce((s, i) => s + i.totalCases, 0),
        weight: round2(items.reduce((s, i) => s + i.totalWeight, 0)),
        amount: round2(items.reduce((s, i) => s + i.amount, 0)),
      },
    })
  } catch (err) { next(err) }
}
