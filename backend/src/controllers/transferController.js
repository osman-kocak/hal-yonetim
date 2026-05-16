import { prisma } from '../utils/prismaClient.js'

// Depo market'ini bul (no=0 veya name='DEPO')
async function findDepoMarket() {
  return prisma.market.findFirst({
    where: { OR: [{ no: 0 }, { name: 'DEPO' }] },
    orderBy: { id: 'asc' },
  })
}

// Depodaki bekleyen girişleri listele (çıkış kesilmemiş, transfer edilmemiş)
export async function listDepoEntries(req, res, next) {
  try {
    const depo = await findDepoMarket()
    if (!depo) return res.status(404).json({ error: 'DEPO market kaydı bulunamadı' })

    const entries = await prisma.entry.findMany({
      where: { marketId: depo.id, exitItems: { none: {} } },
      orderBy: { createdAt: 'desc' },
      include: {
        product: true,
        producer: true,
        quality: true,
        vehicleSession: { include: { driver: true } },
      },
    })
    res.json({ depoId: depo.id, entries })
  } catch (err) { next(err) }
}

// Entry'yi başka markete transfer et (tam veya kısmî - entry split)
export async function createTransfer(req, res, next) {
  try {
    const { entryId, toMarketId, caseCount, note } = req.body
    if (!entryId || !toMarketId) {
      return res.status(400).json({ error: 'Giriş ve hedef pazar zorunlu' })
    }

    const depo = await findDepoMarket()
    if (!depo) return res.status(404).json({ error: 'DEPO market kaydı bulunamadı' })

    const entry = await prisma.entry.findUnique({
      where: { id: Number(entryId) },
      include: { exitItems: true },
    })
    if (!entry) return res.status(404).json({ error: 'Giriş bulunamadı' })
    if (entry.marketId !== depo.id) {
      return res.status(400).json({ error: 'Bu giriş depoda değil' })
    }
    if (entry.exitItems.length > 0) {
      return res.status(409).json({ error: 'Bu giriş için irsaliye kesilmiş, transfer edilemez' })
    }
    if (Number(toMarketId) === depo.id) {
      return res.status(400).json({ error: 'Hedef depodan farklı bir pazar olmalı' })
    }

    const target = await prisma.market.findUnique({ where: { id: Number(toMarketId) } })
    if (!target) return res.status(404).json({ error: 'Hedef pazar bulunamadı' })

    // Kısmî transfer: caseCount verilmişse doğrula
    const transferQty = caseCount == null ? entry.caseCount : Number(caseCount)
    if (!Number.isInteger(transferQty) || transferQty <= 0) {
      return res.status(400).json({ error: 'Kasa miktarı pozitif tam sayı olmalı' })
    }
    if (transferQty > entry.caseCount) {
      return res.status(400).json({ error: `Bu girişte sadece ${entry.caseCount} kasa var` })
    }

    const createdBy = req.user?.name || req.user?.username || 'Depo'

    const transfer = await prisma.$transaction(async (tx) => {
      // Tam transfer: mevcut akış (entry market değiştirir)
      if (transferQty === entry.caseCount) {
        const t = await tx.transfer.create({
          data: {
            entryId: entry.id,
            fromMarketId: depo.id,
            toMarketId: Number(toMarketId),
            note: note?.trim() || null,
            createdBy,
          },
          include: { entry: { include: { product: true } }, fromMarket: true, toMarket: true },
        })
        await tx.entry.update({
          where: { id: entry.id },
          data: { marketId: Number(toMarketId) },
        })
        return t
      }

      // Kısmî transfer: entry split (orantısal kg)
      const ratio = transferQty / entry.caseCount
      const transferWeight = Math.round(entry.weight * ratio * 100) / 100
      const remainingWeight = Math.round((entry.weight - transferWeight) * 100) / 100
      const remainingCases = entry.caseCount - transferQty

      const newEntry = await tx.entry.create({
        data: {
          vehicleSessionId: entry.vehicleSessionId,
          productId: entry.productId,
          producerId: entry.producerId,
          qualityId: entry.qualityId,
          caseCount: transferQty,
          weight: transferWeight,
          weak: entry.weak,
          marketId: Number(toMarketId),
        },
      })

      await tx.entry.update({
        where: { id: entry.id },
        data: { caseCount: remainingCases, weight: remainingWeight },
      })

      const t = await tx.transfer.create({
        data: {
          entryId: newEntry.id,
          fromMarketId: depo.id,
          toMarketId: Number(toMarketId),
          note: note?.trim() || null,
          createdBy,
        },
        include: { entry: { include: { product: true } }, fromMarket: true, toMarket: true },
      })
      return t
    })

    res.status(201).json(transfer)
  } catch (err) { next(err) }
}

// Admin: tüm transfer geçmişi
export async function listTransfers(req, res, next) {
  try {
    const { dateFrom, dateTo, toMarketId } = req.query
    const where = {}
    if (toMarketId) where.toMarketId = Number(toMarketId)
    if (dateFrom || dateTo) {
      where.createdAt = {}
      if (dateFrom) where.createdAt.gte = new Date(dateFrom)
      if (dateTo) {
        const d = new Date(dateTo); d.setHours(23, 59, 59, 999)
        where.createdAt.lte = d
      }
    }
    const transfers = await prisma.transfer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        entry: { include: { product: true, quality: true } },
        fromMarket: true,
        toMarket: true,
      },
    })
    res.json(transfers)
  } catch (err) { next(err) }
}
