import { prisma } from '../utils/prismaClient.js'
import { startOfLocalDay, endOfLocalDay } from '../utils/date.js'
import { audit } from '../utils/audit.js'
import { parsePagination, paginated } from '../utils/pagination.js'

const MARKET_TYPES = ['MARKET_INVOICE', 'MARKET_PAYMENT', 'MARKET_ADJUSTMENT']
const PRODUCER_TYPES = ['PRODUCER_DEBT', 'PRODUCER_PAYMENT', 'PRODUCER_ADJUSTMENT']
const MANUAL_TYPES = ['MARKET_PAYMENT', 'MARKET_ADJUSTMENT', 'PRODUCER_DEBT', 'PRODUCER_PAYMENT', 'PRODUCER_ADJUSTMENT']
const ADJUSTMENT_TYPES = ['MARKET_ADJUSTMENT', 'PRODUCER_ADJUSTMENT']

// Bakiye etkisi.
//
// Export edildi: irsaliye başlığındaki bayi borcu da buradan hesaplanıyor
// (utils/marketSummary.js). Kopyalanırsa yeni bir hareket tipi eklendiğinde
// biri güncellenip diğeri unutulur ve fiş yanlış borç basar.
export function signFor(type) {
  if (type === 'MARKET_INVOICE' || type === 'MARKET_ADJUSTMENT') return +1
  if (type === 'MARKET_PAYMENT') return -1
  if (type === 'PRODUCER_DEBT' || type === 'PRODUCER_ADJUSTMENT') return +1
  if (type === 'PRODUCER_PAYMENT') return -1
  return 0
}

export async function listEntries(req, res, next) {
  try {
    const { type, marketId, producerId, dateFrom, dateTo, scope } = req.query
    const where = {}
    if (type) where.type = type
    if (scope === 'market') where.type = { in: MARKET_TYPES }
    if (scope === 'producer') where.type = { in: PRODUCER_TYPES }
    if (marketId) where.marketId = Number(marketId)
    if (producerId) where.producerId = Number(producerId)
    if (dateFrom || dateTo) {
      where.occurredAt = {}
      // new Date('...') UTC gece yarısı, .setHours() yerel saat → TR'de üst
      // sınır 20:59'a düşüyor ve günün son 3 saati filtreden kayboluyordu
      if (dateFrom) where.occurredAt.gte = startOfLocalDay(dateFrom)
      if (dateTo) where.occurredAt.lte = endOfLocalDay(dateTo)
    }
    const pg = parsePagination(req)
    const [data, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: pg.skip,
        take: pg.limit,
        include: {
          market: true,
          producer: true,
          exit: { select: { id: true } },
        },
      }),
      prisma.ledgerEntry.count({ where }),
    ])
    audit(req, { action: 'READ', resource: 'ledger', recordCount: data.length })
    res.json(paginated(data, total, pg))
  } catch (err) {
    next(err)
  }
}

export async function createEntry(req, res, next) {
  try {
    const { type, amount, marketId, producerId, note, occurredAt, createdBy } = req.body

    if (!MANUAL_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Geçersiz hareket tipi' })
    }
    const a = Number(amount)
    if (!Number.isFinite(a)) {
      return res.status(400).json({ error: 'Tutar geçersiz' })
    }
    if (a === 0) {
      return res.status(400).json({ error: 'Tutar 0 olamaz' })
    }
    // Yön signFor() ile belirlenir, sadece ADJUSTMENT tipleri signed olabilir.
    // Eskiden bu blok boştu: MARKET_PAYMENT'a -1000 girilince sign -1 ile
    // çarpılıp bakiyeye +1000 yazılıyordu — yani tahsilat girmek borcu ARTIRIYORDU.
    if (!ADJUSTMENT_TYPES.includes(type) && a < 0) {
      return res.status(400).json({
        error: 'Bu hareket tipinde tutar pozitif olmalı — borç/alacak yönü otomatik belirlenir',
      })
    }

    if (MARKET_TYPES.includes(type)) {
      if (!marketId) return res.status(400).json({ error: 'Pazar zorunlu' })
    } else if (PRODUCER_TYPES.includes(type)) {
      if (!producerId) return res.status(400).json({ error: 'Üretici zorunlu' })
    }

    const data = {
      type,
      amount: a,
      note: note?.trim() || null,
      marketId: MARKET_TYPES.includes(type) ? Number(marketId) : null,
      producerId: PRODUCER_TYPES.includes(type) ? Number(producerId) : null,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      createdBy: createdBy?.trim() || req.user?.name || req.user?.username || 'Admin',
    }
    const entry = await prisma.ledgerEntry.create({
      data,
      include: { market: true, producer: true },
    })
    res.status(201).json(entry)
  } catch (err) {
    next(err)
  }
}

export async function deleteEntry(req, res, next) {
  try {
    const id = Number(req.params.id)
    const entry = await prisma.ledgerEntry.findUnique({
      where: { id },
      include: { returnRecord: { select: { id: true } } },
    })
    if (!entry) return res.status(404).json({ error: 'Hareket bulunamadı' })
    if (entry.exitId) {
      return res.status(400).json({
        error: 'İrsaliye bağlantılı hareket silinemez; ilgili irsaliyeyi düzenleyin veya silin',
      })
    }
    // İade kaynaklı kredi notunun exitId'si yok; korumasız bırakılınca
    // silinebiliyor ve ReturnRecord.ledgerEntryId SetNull ile öksüz kalıyordu.
    if (entry.returnRecord) {
      return res.status(400).json({
        error: 'İade bağlantılı hareket silinemez; iade kaydını silin',
      })
    }
    await prisma.ledgerEntry.delete({ where: { id } })
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

export async function marketBalances(req, res, next) {
  try {
    const groups = await prisma.ledgerEntry.groupBy({
      by: ['marketId', 'type'],
      where: { marketId: { not: null } },
      _sum: { amount: true },
    })
    const markets = await prisma.market.findMany({ orderBy: { no: 'asc' } })
    const map = new Map()
    for (const g of groups) {
      const cur = map.get(g.marketId) ?? 0
      const v = g._sum.amount ?? 0
      map.set(g.marketId, cur + signFor(g.type) * v)
    }
    res.json(markets.map((m) => ({ ...m, balance: Math.round((map.get(m.id) ?? 0) * 100) / 100 })))
  } catch (err) {
    next(err)
  }
}

export async function producerBalances(req, res, next) {
  try {
    const groups = await prisma.ledgerEntry.groupBy({
      by: ['producerId', 'type'],
      where: { producerId: { not: null } },
      _sum: { amount: true },
    })
    const producers = await prisma.producer.findMany({ orderBy: { name: 'asc' } })
    const map = new Map()
    for (const g of groups) {
      const cur = map.get(g.producerId) ?? 0
      const v = g._sum.amount ?? 0
      map.set(g.producerId, cur + signFor(g.type) * v)
    }
    res.json(producers.map((p) => ({ ...p, balance: Math.round((map.get(p.id) ?? 0) * 100) / 100 })))
  } catch (err) {
    next(err)
  }
}

// Kar-Zarar Raporu: belirli tarih aralığında gelir/gider/net + bekleyen
export async function financialReport(req, res, next) {
  try {
    const { dateFrom, dateTo } = req.query
    const where = {}
    if (dateFrom || dateTo) {
      where.occurredAt = {}
      if (dateFrom) where.occurredAt.gte = startOfLocalDay(dateFrom)
      if (dateTo) where.occurredAt.lte = endOfLocalDay(dateTo)
    }
    const groups = await prisma.ledgerEntry.groupBy({
      by: ['type'],
      where,
      _sum: { amount: true },
    })
    const sums = Object.fromEntries(groups.map((g) => [g.type, g._sum.amount ?? 0]))
    const totalInvoice = sums.MARKET_INVOICE ?? 0
    const totalCollected = sums.MARKET_PAYMENT ?? 0
    const totalDebt = sums.PRODUCER_DEBT ?? 0
    const totalPaid = sums.PRODUCER_PAYMENT ?? 0

    // Toplam bakiye (tüm zaman, filtresiz) — bekleyen alacak/borç için
    const totalGroups = await prisma.ledgerEntry.groupBy({
      by: ['type'],
      _sum: { amount: true },
    })
    const totalSums = Object.fromEntries(totalGroups.map((g) => [g.type, g._sum.amount ?? 0]))
    const pendingFromMarkets =
      (totalSums.MARKET_INVOICE ?? 0)
      + (totalSums.MARKET_ADJUSTMENT ?? 0)
      - (totalSums.MARKET_PAYMENT ?? 0)
    const pendingToProducers =
      (totalSums.PRODUCER_DEBT ?? 0)
      + (totalSums.PRODUCER_ADJUSTMENT ?? 0)
      - (totalSums.PRODUCER_PAYMENT ?? 0)

    res.json({
      period: { dateFrom: dateFrom ?? null, dateTo: dateTo ?? null },
      revenue: { invoiced: totalInvoice, collected: totalCollected },
      expense: { owedToProducers: totalDebt, paidToProducers: totalPaid },
      net: totalCollected - totalPaid,
      pending: {
        fromMarkets: Math.round(pendingFromMarkets * 100) / 100,
        toProducers: Math.round(pendingToProducers * 100) / 100,
      },
    })
  } catch (err) {
    next(err)
  }
}
