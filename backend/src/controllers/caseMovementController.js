import { prisma } from '../utils/prismaClient.js'

const MARKET_TYPES = ['MARKET_OUT', 'MARKET_IN', 'MARKET_INIT', 'MARKET_ADJUST']
const DRIVER_TYPES = ['DRIVER_OUT', 'DRIVER_IN', 'DRIVER_INIT', 'DRIVER_ADJUST']
const MANUAL_TYPES = ['MARKET_IN', 'MARKET_INIT', 'MARKET_ADJUST', 'DRIVER_OUT', 'DRIVER_IN', 'DRIVER_INIT', 'DRIVER_ADJUST']

// Bakiyeyi hangi yönde etkiler? (groupBy reduce için)
function signFor(type) {
  if (type === 'MARKET_OUT' || type === 'MARKET_INIT' || type === 'MARKET_ADJUST') return +1
  if (type === 'MARKET_IN') return -1
  if (type === 'DRIVER_OUT' || type === 'DRIVER_INIT' || type === 'DRIVER_ADJUST') return +1
  if (type === 'DRIVER_IN') return -1
  return 0
}

export async function listMovements(req, res, next) {
  try {
    const { type, marketId, driverId, dateFrom, dateTo, scope } = req.query
    const where = {}
    if (type) where.type = type
    if (scope === 'market') where.type = { in: MARKET_TYPES }
    if (scope === 'driver') where.type = { in: DRIVER_TYPES }
    if (marketId) where.marketId = Number(marketId)
    if (driverId) where.driverId = Number(driverId)
    if (dateFrom || dateTo) {
      where.occurredAt = {}
      if (dateFrom) where.occurredAt.gte = new Date(dateFrom)
      if (dateTo) {
        const d = new Date(dateTo)
        d.setHours(23, 59, 59, 999)
        where.occurredAt.lte = d
      }
    }
    const data = await prisma.caseMovement.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      include: {
        market: true,
        driver: true,
        exit: { select: { id: true } },
      },
    })
    res.json(data)
  } catch (err) {
    next(err)
  }
}

export async function createMovement(req, res, next) {
  try {
    const { type, qty, marketId, driverId, note, occurredAt, createdBy } = req.body

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

    if (MARKET_TYPES.includes(type)) {
      if (!marketId) return res.status(400).json({ error: 'Pazar zorunlu' })
    } else if (DRIVER_TYPES.includes(type)) {
      if (!driverId) return res.status(400).json({ error: 'Şoför zorunlu' })
    }

    const data = {
      type,
      qty: q,
      note: note?.trim() || null,
      marketId: MARKET_TYPES.includes(type) ? Number(marketId) : null,
      driverId: DRIVER_TYPES.includes(type) ? Number(driverId) : null,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      createdBy: createdBy?.trim() || 'Admin',
    }
    const mv = await prisma.caseMovement.create({
      data,
      include: { market: true, driver: true },
    })
    res.status(201).json(mv)
  } catch (err) {
    next(err)
  }
}

export async function deleteMovement(req, res, next) {
  try {
    const id = Number(req.params.id)
    const mv = await prisma.caseMovement.findUnique({ where: { id } })
    if (!mv) return res.status(404).json({ error: 'Hareket bulunamadı' })
    if (mv.exitId) {
      return res.status(400).json({
        error: 'İrsaliye bağlantılı hareket silinemez; ilgili irsaliyeyi düzenleyin veya silin',
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

export async function driverBalances(req, res, next) {
  try {
    const groups = await prisma.caseMovement.groupBy({
      by: ['driverId', 'type'],
      where: { driverId: { not: null } },
      _sum: { qty: true },
    })
    const drivers = await prisma.driver.findMany({ orderBy: { name: 'asc' } })
    const map = new Map()
    for (const g of groups) {
      const cur = map.get(g.driverId) ?? 0
      const v = g._sum.qty ?? 0
      map.set(g.driverId, cur + signFor(g.type) * v)
    }
    res.json(drivers.map((d) => ({ ...d, balance: map.get(d.id) ?? 0 })))
  } catch (err) {
    next(err)
  }
}
