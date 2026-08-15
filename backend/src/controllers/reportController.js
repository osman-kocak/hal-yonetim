import { prisma } from '../utils/prismaClient.js'
import { getPriceMap } from './priceController.js'
import { toPriceDate, startOfLocalDay, endOfLocalDay } from '../utils/date.js'
import { BUNCH, PIECE } from '../utils/units.js'
import { priceOf } from '../utils/prices.js'

// Raporlar sadece gerçek mal kabulünü sayar. İade ve imha entry'leri de
// Entry tablosunda durduğu için filtresiz toplamak çift sayıma yol açıyordu:
// Pazar 3'e giden 180 kg iade gelince günlük rapor 360 kg gösteriyordu.
const HARVEST_ONLY = { source: 'HARVEST' }

// Entry.weight üç farklı şey tutuyor: kilo ürünlerinde tartılan KİLO, bağ
// ürünlerinde BAĞ, adet ürünlerinde ADET (bkz. utils/units.js). Toplarken
// ayrılmazsa "150 bağ maydanoz" günlük kg toplamına 150 kg olarak girer ve rapor
// şişer. Bağ ile adet de birbirine eklenmez — toplanabilir sayı değiller.
// Bu yüzden her rapor satırı kendi birimini taşır, özet toplamlar ayrı hesaplanır.
function splitByUnit(rows, pickUnit = (r) => r.unit, pickWeight = (r) => r.weight ?? 0) {
  let weight = 0   // yalnızca CASE — gerçek kilo
  let bunches = 0  // yalnızca BUNCH — bağ
  let pieces = 0   // yalnızca PIECE — adet
  for (const r of rows) {
    const u = pickUnit(r)
    if (u === BUNCH) bunches += pickWeight(r)
    else if (u === PIECE) pieces += pickWeight(r)
    else weight += pickWeight(r)
  }
  return { weight: Math.round(weight * 100) / 100, bunches, pieces }
}

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

    const [grouped, exitCount] = await Promise.all([
      prisma.entry.groupBy({
        by: ['unit'],
        where: { createdAt: { gte: start, lte: end }, ...HARVEST_ONLY },
        _sum: { caseCount: true, weight: true },
        _count: { id: true },
      }),
      prisma.exit.count({ where: { createdAt: { gte: start, lte: end } } }),
    ])

    const { weight, bunches, pieces } = splitByUnit(grouped, (g) => g.unit, (g) => g._sum.weight ?? 0)

    res.json({
      date: start.toLocaleDateString('tr-TR'),
      totalEntries: grouped.reduce((s, g) => s + g._count.id, 0),
      totalCases: grouped.reduce((s, g) => s + (g._sum.caseCount ?? 0), 0),
      totalWeight: weight,
      totalBunches: bunches,
      totalPieces: pieces,
      totalExits: exitCount,
    })
  } catch (err) { next(err) }
}

export async function byMarketReport(req, res, next) {
  try {
    const { start, end } = dayRange(req.query.date)

    // unit groupBy'a giriyor: bir pazara kilo, bağ ve adet ürünü birlikte gitmiş
    // olabilir, üçü tek "Toplam Ağırlık" hücresinde toplanamaz.
    const grouped = await prisma.entry.groupBy({
      by: ['marketId', 'unit'],
      where: { createdAt: { gte: start, lte: end }, ...HARVEST_ONLY },
      _sum: { caseCount: true, weight: true },
      _count: { id: true },
    })

    const marketIds = [...new Set(grouped.map((g) => g.marketId))]
    const markets = await prisma.market.findMany({
      where: { id: { in: marketIds } },
      orderBy: { no: 'asc' },
    })
    const marketMap = Object.fromEntries(markets.map((m) => [m.id, m]))

    // Pazar başına tek satır; kilo, bağ ve adet ayrı kolonlarda
    const byMarket = new Map()
    for (const g of grouped) {
      if (!byMarket.has(g.marketId)) {
        byMarket.set(g.marketId, {
          market: marketMap[g.marketId],
          totalEntries: 0, totalCases: 0, totalWeight: 0, totalBunches: 0, totalPieces: 0,
        })
      }
      const row = byMarket.get(g.marketId)
      row.totalEntries += g._count.id
      row.totalCases += g._sum.caseCount ?? 0
      if (g.unit === BUNCH) row.totalBunches += g._sum.weight ?? 0
      else if (g.unit === PIECE) row.totalPieces += g._sum.weight ?? 0
      else row.totalWeight += g._sum.weight ?? 0
    }

    const result = [...byMarket.values()]
      .map((r) => ({ ...r, totalWeight: Math.round(r.totalWeight * 100) / 100 }))
      .sort((a, b) => (a.market?.no ?? 0) - (b.market?.no ?? 0))

    res.json(result)
  } catch (err) { next(err) }
}

export async function byProductReport(req, res, next) {
  try {
    const { start, end } = dayRange(req.query.date)

    const grouped = await prisma.entry.groupBy({
      by: ['productId', 'qualityId', 'unit'],
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
        const pricePerKg = priceOf(priceMap, g.productId, g.qualityId)
        const totalWeight = g._sum.weight ?? 0
        return {
          product: productMap[g.productId],
          quality: qualityMap[g.qualityId],
          // Satır kendi birimini taşır: BUNCH'ta totalWeight bağ, PIECE'te adet;
          // pricePerKg da ₺/bağ, ₺/adet — ciro formülü üç birimde de doğru.
          unit: g.unit,
          totalEntries: g._count.id,
          totalCases: g._sum.caseCount ?? 0,
          totalWeight,
          pricePerKg,
          totalRevenue: pricePerKg !== null ? pricePerKg * totalWeight : null,
        }
      })
      // Ciroya göre sırala: kg ile bağ/adet sayısını karşılaştırmak anlamsız olurdu
      // (150 bağ maydanoz 100 kg domatesin üstüne çıkardı).
      .sort((a, b) => (b.totalRevenue ?? 0) - (a.totalRevenue ?? 0) || b.totalWeight - a.totalWeight)

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
      by: ['productId', 'unit'],
      where: { createdAt: { gte: since }, ...HARVEST_ONLY },
      _sum: { caseCount: true, weight: true },
      _count: { id: true },
      orderBy: { _sum: { weight: 'desc' } },
      take: limit,
    })

    const productIds = [...new Set(grouped.map((g) => g.productId))]
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    })
    const productMap = Object.fromEntries(products.map((p) => [p.id, p]))

    const result = grouped.map((g) => ({
      product: productMap[g.productId],
      unit: g.unit, // BUNCH'ta totalWeight bağ, PIECE'te adet — kilo değil
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
      by: ['productId', 'unit'],
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
    // amount ürün bazında toplandı; ürünün birden fazla birim satırı varsa
    // (cutover geçişi) tutar ilk satıra yazılır, çift sayılmaz.
    const amountUsed = new Set()
    const items = grouped.map((g) => {
      const amount = amountUsed.has(g.productId) ? 0 : (amountByProduct[g.productId] ?? 0)
      amountUsed.add(g.productId)
      return {
        product: productMap[g.productId],
        unit: g.unit,
        entryCount: g._count.id,
        totalCases: g._sum.caseCount ?? 0,
        totalWeight: round2(g._sum.weight ?? 0),
        amount: round2(amount),
      }
    })

    const { weight, bunches, pieces } = splitByUnit(items, (i) => i.unit, (i) => i.totalWeight)

    res.json({
      items,
      totals: {
        cases: items.reduce((s, i) => s + i.totalCases, 0),
        weight,          // yalnızca kilo ürünlerinin kilosu
        bunches,         // bağ ürünlerinin bağ sayısı
        pieces,          // adet ürünlerinin adedi
        amount: round2(items.reduce((s, i) => s + i.amount, 0)),
      },
    })
  } catch (err) { next(err) }
}
