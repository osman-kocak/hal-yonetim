import { prisma } from '../utils/prismaClient.js'
import { startOfLocalDay, endOfLocalDay } from '../utils/date.js'
import { parsePagination, paginated } from '../utils/pagination.js'

const MARKET_TYPES = ['MARKET_OUT', 'MARKET_IN', 'MARKET_INIT', 'MARKET_ADJUST']
const REGION_TYPES = ['REGION_OUT', 'REGION_IN', 'REGION_ADJUST']
// MARKET_OUT elle girilemez — irsaliye (Exit) ile otomatik oluşur.
// REGION_IN de elle girilemez — mal kabul (Entry) ile otomatik oluşur.
const MANUAL_TYPES = ['MARKET_IN', 'MARKET_INIT', 'MARKET_ADJUST', 'REGION_OUT', 'REGION_ADJUST']

// Bakiyeyi hangi yönde etkiler? (groupBy reduce için)
// Bakiye = karşı tarafın üstünde duran kasa. Verince artar, dönünce azalır.
//
// Export edildi: irsaliye başlığındaki kasa bakiyesi de buradan hesaplanıyor
// (utils/marketSummary.js). Kopyalanırsa yeni bir hareket tipi eklendiğinde
// biri güncellenip diğeri unutulur ve fiş yanlış bakiye basar.
export function signFor(type) {
  if (type === 'MARKET_OUT' || type === 'MARKET_INIT' || type === 'MARKET_ADJUST') return +1
  if (type === 'MARKET_IN') return -1
  if (type === 'REGION_OUT' || type === 'REGION_ADJUST') return +1
  if (type === 'REGION_IN') return -1
  return 0
}

export async function listMovements(req, res, next) {
  try {
    const { type, marketId, regionId, dateFrom, dateTo, scope } = req.query
    const where = {}
    if (type) where.type = type
    if (scope === 'market') where.type = { in: MARKET_TYPES }
    if (scope === 'region') where.type = { in: REGION_TYPES }
    if (marketId) where.marketId = Number(marketId)
    if (regionId) where.regionId = Number(regionId)
    if (dateFrom || dateTo) {
      where.occurredAt = {}
      // TR saat diliminde üst sınır 20:59'a düşüyordu — bkz. utils/date.js
      if (dateFrom) where.occurredAt.gte = startOfLocalDay(dateFrom)
      if (dateTo) where.occurredAt.lte = endOfLocalDay(dateTo)
    }
    const pg = parsePagination(req)
    const [data, total] = await Promise.all([
      prisma.caseMovement.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: pg.skip,
        take: pg.limit,
        include: {
          market: true,
          region: true,
          exit: { select: { id: true } },
          entry: { select: { id: true } },
        },
      }),
      prisma.caseMovement.count({ where }),
    ])
    res.json(paginated(data, total, pg))
  } catch (err) {
    next(err)
  }
}

export async function createMovement(req, res, next) {
  try {
    const { type, qty, marketId, regionId, note, occurredAt, createdBy } = req.body

    if (!MANUAL_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Geçersiz hareket tipi' })
    }
    const q = Number(qty)
    if (!Number.isInteger(q)) {
      return res.status(400).json({ error: 'Adet tam sayı olmalı' })
    }
    if (q === 0) {
      return res.status(400).json({ error: 'Adet 0 olamaz' })
    }

    const isRegion = REGION_TYPES.includes(type)
    if (isRegion) {
      if (!regionId) return res.status(400).json({ error: 'Bölge zorunlu' })
      const region = await prisma.region.findUnique({
        where: { id: Number(regionId) },
        select: { active: true },
      })
      if (!region) return res.status(400).json({ error: 'Bölge bulunamadı' })
      if (!region.active) return res.status(400).json({ error: 'Pasif bölgeye kasa verilemez' })
    } else if (!marketId) {
      return res.status(400).json({ error: 'Pazar zorunlu' })
    }

    const data = {
      type,
      qty: q,
      note: note?.trim() || null,
      marketId: isRegion ? null : Number(marketId),
      regionId: isRegion ? Number(regionId) : null,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      // Oturumdaki kullanıcıyı yaz — eskiden kasacının hareketleri de 'Admin'
      // olarak loglanıyordu (ledgerController req.user'ı doğru kullanıyor)
      createdBy: createdBy?.trim() || req.user?.name || req.user?.username || 'Admin',
    }
    const mv = await prisma.caseMovement.create({
      data,
      include: { market: true, region: true },
    })
    res.status(201).json(mv)
  } catch (err) {
    next(err)
  }
}

export async function deleteMovement(req, res, next) {
  try {
    const id = Number(req.params.id)
    const mv = await prisma.caseMovement.findUnique({
      where: { id },
      include: { returnRecord: { select: { id: true } } },
    })
    if (!mv) return res.status(404).json({ error: 'Hareket bulunamadı' })
    if (mv.exitId) {
      return res.status(400).json({
        error: 'İrsaliye bağlantılı hareket silinemez; ilgili irsaliyeyi düzenleyin veya silin',
      })
    }
    // İade kaynaklı hareketin exitId'si yok; korumasız bırakılınca silinebiliyor
    // ve ReturnRecord.caseMovementId SetNull ile öksüz kalıyordu.
    if (mv.returnRecord) {
      return res.status(400).json({
        error: 'İade bağlantılı hareket silinemez; iade kaydını silin',
      })
    }
    // Mal kabulden doğan REGION_IN: girişi silmeden kasa düşümü kaldırılırsa
    // bölge bakiyesi mal kabul kayıtlarıyla uyuşmaz kalır.
    if (mv.entryId) {
      return res.status(400).json({
        error: 'Mal kabul bağlantılı hareket silinemez; ilgili girişi silin veya düzenleyin',
      })
    }
    await prisma.caseMovement.delete({ where: { id } })
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

export async function marketBalances(req, res, next) {
  try {
    const groups = await prisma.caseMovement.groupBy({
      by: ['marketId', 'type'],
      where: { marketId: { not: null } },
      _sum: { qty: true },
    })
    const markets = await prisma.market.findMany({ orderBy: { no: 'asc' } })
    const map = new Map()
    for (const g of groups) {
      const cur = map.get(g.marketId) ?? 0
      const v = g._sum.qty ?? 0
      map.set(g.marketId, cur + signFor(g.type) * v)
    }
    res.json(markets.map((m) => ({ ...m, balance: map.get(m.id) ?? 0 })))
  } catch (err) {
    next(err)
  }
}

// Bölgelerin üstünde duran kasa. Pasif bölge de listelenir — bakiyesi varsa
// kapatılması gerekir, listeden düşerse borç görünmez olur.
export async function regionBalances(req, res, next) {
  try {
    const groups = await prisma.caseMovement.groupBy({
      by: ['regionId', 'type'],
      where: { regionId: { not: null } },
      _sum: { qty: true },
    })
    const regions = await prisma.region.findMany({ orderBy: { name: 'asc' } })
    const map = new Map()
    for (const g of groups) {
      const cur = map.get(g.regionId) ?? 0
      const v = g._sum.qty ?? 0
      map.set(g.regionId, cur + signFor(g.type) * v)
    }
    res.json(regions.map((r) => ({ ...r, balance: map.get(r.id) ?? 0 })))
  } catch (err) {
    next(err)
  }
}

