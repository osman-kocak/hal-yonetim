import { prisma } from '../utils/prismaClient.js'
import { BUNCH, PIECE, isCountable } from '../utils/units.js'

// Raporlar sadece gerçek mal kabulünü sayar — iade/imha entry'leri hariç
// (bkz. reportController.HARVEST_ONLY, aynı çift sayım sorunu)
const HARVEST_ONLY = { source: 'HARVEST' }

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

// `period` veya `days` parametresinden tarih aralığı çıkarır
function rangeFromQuery(query) {
  const period = query.period
  const now = new Date()
  if (period === 'today') {
    return { start: startOfDay(now), end: endOfDay(now), days: 1 }
  }
  if (period === 'week') {
    const start = startOfDay(now)
    start.setDate(start.getDate() - 6)
    return { start, end: endOfDay(now), days: 7 }
  }
  if (period === 'month') {
    const start = startOfDay(now)
    start.setDate(start.getDate() - 29)
    return { start, end: endOfDay(now), days: 30 }
  }
  // `days` parametresi (varsayılan 30)
  const days = Math.min(Math.max(Number(query.days ?? 30), 1), 365)
  const start = startOfDay(now)
  start.setDate(start.getDate() - (days - 1))
  return { start, end: endOfDay(now), days }
}

// Genel özet: KPI'lar
export async function overview(req, res, next) {
  try {
    const { start, end, days } = rangeFromQuery(req.query)

    const [entryByUnit, exitCount, ledgerRev, pending, weakEntries] = await Promise.all([
      // Birim bazında: Entry.weight kasa ürününde kilo, bağ ürününde bağ adedi.
      // Tek toplamda birleştirilirse KPI'daki "Ağırlık" şişer (bkz. utils/units.js).
      // disposableCase gruplamaya dahil: "Kasa" KPI'ı kasa MUHASEBESİ rakamı
      // olmalı, siyah/karton kasa hiçbir bakiyeye girmiyor (bkz. utils/cases.js
      // → trackedCases). Miktar/giriş sayısı toplamları bundan etkilenmiyor,
      // onlar fiziksel hacim.
      prisma.entry.groupBy({
        by: ['unit', 'disposableCase'],
        where: { createdAt: { gte: start, lte: end } },
        _sum: { caseCount: true, weight: true },
        _count: { id: true },
      }),
      prisma.exit.count({ where: { createdAt: { gte: start, lte: end } } }),
      prisma.ledgerEntry.aggregate({
        where: { type: 'MARKET_INVOICE', occurredAt: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      prisma.ledgerEntry.groupBy({
        by: ['type'],
        _sum: { amount: true },
      }),
      prisma.entry.count({
        where: { createdAt: { gte: start, lte: end }, weak: true },
      }),
    ])

    const pendingSums = Object.fromEntries(pending.map((g) => [g.type, g._sum.amount ?? 0]))
    const pendingFromMarkets =
      (pendingSums.MARKET_INVOICE ?? 0) + (pendingSums.MARKET_ADJUSTMENT ?? 0) - (pendingSums.MARKET_PAYMENT ?? 0)
    const pendingToProducers =
      (pendingSums.PRODUCER_DEBT ?? 0) + (pendingSums.PRODUCER_ADJUSTMENT ?? 0) - (pendingSums.PRODUCER_PAYMENT ?? 0)

    const totalEntries = entryByUnit.reduce((s, g) => s + g._count.id, 0)
    const weakRate = totalEntries > 0 ? (weakEntries / totalEntries) * 100 : 0
    const sumOf = (pred) => entryByUnit.filter(pred).reduce((s, g) => s + (g._sum.weight ?? 0), 0)
    const kgSum = sumOf((g) => !isCountable(g.unit))
    const bunchSum = sumOf((g) => g.unit === BUNCH)
    const pieceSum = sumOf((g) => g.unit === PIECE)

    res.json({
      period: { start, end, days },
      kpi: {
        entries: totalEntries,
        // Siyah/karton kasa HARİÇ: bu sayı bayiye/bölgeye borç doğuran kasa.
        // Ham fiziksel toplam istenirse ayrı bir alan eklenmeli — karıştırılırsa
        // Kasa Takip'teki bakiyeyle arasındaki fark açıklanamaz hale gelir.
        cases: entryByUnit
          .filter((g) => !g.disposableCase)
          .reduce((s, g) => s + (g._sum.caseCount ?? 0), 0),
        weight: Math.round(kgSum * 100) / 100,
        bunches: bunchSum,
        pieces: pieceSum,
        exits: exitCount,
        invoiced: Math.round((ledgerRev._sum.amount ?? 0) * 100) / 100,
        weakRate: Math.round(weakRate * 10) / 10,
      },
      pending: {
        fromMarkets: Math.round(pendingFromMarkets * 100) / 100,
        toProducers: Math.round(pendingToProducers * 100) / 100,
      },
    })
  } catch (err) { next(err) }
}

// Trend: günlük giriş ağırlığı + ciro
export async function trend(req, res, next) {
  try {
    const { start, days } = rangeFromQuery(req.query)

    // SQL bazlı günlük gruplama PostgreSQL'de date_trunc ile
    // weight kolonu üç farklı birim taşıyor (CASE→kilo, BUNCH→bağ, PIECE→adet).
    // FILTER ile ayrılmazsa trend grafiğindeki kg çizgisi bağ/adet sayılarıyla
    // şişer. Bağ ile adet de ayrı toplanır — toplanabilir sayı değiller.
    const entryRows = await prisma.$queryRaw`
      SELECT
        DATE("createdAt") AS day,
        COALESCE(SUM("caseCount"), 0)::int AS cases,
        COALESCE(SUM("weight") FILTER (WHERE "unit"::text NOT IN ('BUNCH', 'PIECE')), 0)::float AS weight,
        COALESCE(SUM("weight") FILTER (WHERE "unit"::text = 'BUNCH'), 0)::float AS bunches,
        COALESCE(SUM("weight") FILTER (WHERE "unit"::text = 'PIECE'), 0)::float AS pieces,
        COUNT(*)::int AS count
      FROM "Entry"
      WHERE "createdAt" >= ${start}
      GROUP BY DATE("createdAt")
      ORDER BY day ASC
    `
    const ledgerRows = await prisma.$queryRaw`
      SELECT
        DATE("occurredAt") AS day,
        COALESCE(SUM("amount"), 0)::float AS revenue
      FROM "LedgerEntry"
      WHERE "type" = 'MARKET_INVOICE' AND "occurredAt" >= ${start}
      GROUP BY DATE("occurredAt")
      ORDER BY day ASC
    `

    const entryMap = new Map()
    for (const r of entryRows) entryMap.set(new Date(r.day).toISOString().slice(0, 10), r)
    const ledgerMap = new Map()
    for (const r of ledgerRows) ledgerMap.set(new Date(r.day).toISOString().slice(0, 10), r)

    // Günleri sırayla doldur
    const result = []
    for (let i = 0; i < days; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      const key = d.toISOString().slice(0, 10)
      const e = entryMap.get(key)
      const l = ledgerMap.get(key)
      result.push({
        date: key,
        label: d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
        entries: Number(e?.count ?? 0),
        cases: Number(e?.cases ?? 0),
        weight: Math.round(Number(e?.weight ?? 0) * 100) / 100,
        bunches: Number(e?.bunches ?? 0),
        pieces: Number(e?.pieces ?? 0),
        revenue: Math.round(Number(l?.revenue ?? 0) * 100) / 100,
      })
    }
    res.json(result)
  } catch (err) { next(err) }
}

// Top bölge: en çok kasa getiren
export async function byRegion(req, res, next) {
  try {
    const { start, end } = rangeFromQuery(req.query)
    const limit = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 50)

    // Entry.regionSession.regionId üzerinden gruplama.
    // INNER JOIN bilinçli: oturumsuz entry'ler (iade kayıtları) sayılmaz.
    const rows = await prisma.$queryRaw`
      SELECT
        r."id" AS "regionId",
        r."name" AS "regionName",
        COALESCE(SUM(e."caseCount"), 0)::int AS cases,
        COALESCE(SUM(e."weight") FILTER (WHERE e."unit"::text NOT IN ('BUNCH', 'PIECE')), 0)::float AS weight,
        COALESCE(SUM(e."weight") FILTER (WHERE e."unit"::text = 'BUNCH'), 0)::float AS bunches,
        COALESCE(SUM(e."weight") FILTER (WHERE e."unit"::text = 'PIECE'), 0)::float AS pieces,
        COUNT(e."id")::int AS entries
      FROM "Entry" e
      JOIN "RegionSession" rs ON rs."id" = e."regionSessionId"
      JOIN "Region" r ON r."id" = rs."regionId"
      WHERE e."createdAt" >= ${start} AND e."createdAt" <= ${end}
      GROUP BY r."id", r."name"
      ORDER BY cases DESC
      LIMIT ${limit}
    `
    res.json(rows.map((r) => ({
      region: { id: Number(r.regionId), name: r.regionName },
      cases: Number(r.cases),
      weight: Math.round(Number(r.weight) * 100) / 100,
      bunches: Number(r.bunches),
      pieces: Number(r.pieces),
      entries: Number(r.entries),
    })))
  } catch (err) { next(err) }
}

// Top bayi: en çok irsaliye tutarı
export async function byMarket(req, res, next) {
  try {
    const { start, end } = rangeFromQuery(req.query)
    const limit = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 50)

    const groups = await prisma.ledgerEntry.groupBy({
      by: ['marketId'],
      where: {
        type: 'MARKET_INVOICE',
        occurredAt: { gte: start, lte: end },
        marketId: { not: null },
      },
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: limit,
    })
    const marketIds = groups.map((g) => g.marketId).filter(Boolean)
    const markets = await prisma.market.findMany({ where: { id: { in: marketIds } } })
    const map = Object.fromEntries(markets.map((m) => [m.id, m]))

    res.json(groups.map((g) => ({
      market: map[g.marketId],
      revenue: Math.round((g._sum.amount ?? 0) * 100) / 100,
      invoiceCount: g._count.id,
    })))
  } catch (err) { next(err) }
}

// Top ürün: ağırlık bazlı (mevcut topProducts'a benzer ama tarihli)
export async function byProduct(req, res, next) {
  try {
    const { start, end } = rangeFromQuery(req.query)
    const limit = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 50)

    const grouped = await prisma.entry.groupBy({
      by: ['productId', 'unit'],
      where: { createdAt: { gte: start, lte: end }, ...HARVEST_ONLY },
      _sum: { caseCount: true, weight: true },
      _count: { id: true },
      orderBy: { _sum: { weight: 'desc' } },
      take: limit,
    })
    const productIds = [...new Set(grouped.map((g) => g.productId))]
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } })
    const map = Object.fromEntries(products.map((p) => [p.id, p]))

    res.json(grouped.map((g) => ({
      product: map[g.productId],
      // BUNCH'ta weight bağ, PIECE'te adet — grafik etiketi buna bakmalı
      unit: g.unit,
      cases: g._sum.caseCount ?? 0,
      weight: Math.round((g._sum.weight ?? 0) * 100) / 100,
      entries: g._count.id,
    })))
  } catch (err) { next(err) }
}

// Zayıf mal oranı
export async function quality(req, res, next) {
  try {
    const { start, end } = rangeFromQuery(req.query)
    const [total, weak] = await Promise.all([
      prisma.entry.count({ where: { createdAt: { gte: start, lte: end } } }),
      prisma.entry.count({ where: { createdAt: { gte: start, lte: end }, weak: true } }),
    ])
    const normal = total - weak
    res.json({
      total,
      weak,
      normal,
      weakRate: total > 0 ? Math.round((weak / total) * 1000) / 10 : 0,
    })
  } catch (err) { next(err) }
}
