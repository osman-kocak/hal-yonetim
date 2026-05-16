import { prisma } from '../utils/prismaClient.js'
import { getPriceMap } from './priceController.js'

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

// Ürün bazında toplu transfer: FIFO ile entry'leri tüket (tam/split)
export async function createGroupedTransfer(req, res, next) {
  try {
    const { productId, requestedCases, toMarketId, note, weak } = req.body
    if (!productId || !toMarketId || !requestedCases) {
      return res.status(400).json({ error: 'Ürün, hedef pazar ve kasa adedi zorunlu' })
    }

    const totalRequested = Number(requestedCases)
    if (!Number.isInteger(totalRequested) || totalRequested <= 0) {
      return res.status(400).json({ error: 'Kasa adedi pozitif tam sayı olmalı' })
    }

    const depo = await findDepoMarket()
    if (!depo) return res.status(404).json({ error: 'DEPO market kaydı bulunamadı' })

    if (Number(toMarketId) === depo.id) {
      return res.status(400).json({ error: 'Hedef depodan farklı bir pazar olmalı' })
    }

    const target = await prisma.market.findUnique({ where: { id: Number(toMarketId) } })
    if (!target) return res.status(404).json({ error: 'Hedef pazar bulunamadı' })

    // Bu ürünün depodaki bekleyen entry'leri (oldest first)
    // weak parametresi verilmişse sadece o tipteki entry'leri al (zayıf vs normal ayrımı)
    const where = {
      marketId: depo.id,
      productId: Number(productId),
      exitItems: { none: {} },
    }
    if (typeof weak === 'boolean') where.weak = weak
    const candidates = await prisma.entry.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { exitItems: true },
    })

    const available = candidates.reduce((s, e) => s + e.caseCount, 0)
    if (totalRequested > available) {
      return res.status(400).json({ error: `Depoda sadece ${available} kasa var, ${totalRequested} talep edildi` })
    }

    const createdBy = req.user?.name || req.user?.username || 'Depo'

    const transfers = await prisma.$transaction(async (tx) => {
      const results = []
      let remaining = totalRequested

      for (const entry of candidates) {
        if (remaining <= 0) break
        if (entry.exitItems.length > 0) continue

        const takeQty = Math.min(remaining, entry.caseCount)
        const fullEntry = takeQty === entry.caseCount

        if (fullEntry) {
          // Entry tamamen hedefe taşınır
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
          results.push(t)
        } else {
          // Entry split
          const ratio = takeQty / entry.caseCount
          const transferWeight = Math.round(entry.weight * ratio * 100) / 100
          const remainingWeight = Math.round((entry.weight - transferWeight) * 100) / 100
          const remainingCases = entry.caseCount - takeQty

          const newEntry = await tx.entry.create({
            data: {
              vehicleSessionId: entry.vehicleSessionId,
              productId: entry.productId,
              producerId: entry.producerId,
              qualityId: entry.qualityId,
              caseCount: takeQty,
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
          results.push(t)
        }
        remaining -= takeQty
      }
      return results
    })

    res.status(201).json({
      transfers,
      totalTransferred: totalRequested,
      entriesAffected: transfers.length,
    })
  } catch (err) { next(err) }
}

// Bayiden iade kabul: yeni depo entry'si + ledger düşümü + boş kasa hareketi
export async function createReturn(req, res, next) {
  try {
    const { fromMarketId, productId, caseCount, weight, weak, discarded, pricePerKg, note, qualityId } = req.body
    if (!fromMarketId || !productId || !caseCount || !weight) {
      return res.status(400).json({ error: 'Bayi, ürün, kasa ve ağırlık zorunlu' })
    }

    const c = Number(caseCount)
    const w = Number(weight)
    if (!Number.isInteger(c) || c < 1) {
      return res.status(400).json({ error: 'Kasa adedi pozitif tam sayı olmalı' })
    }
    if (!Number.isFinite(w) || w <= 0) {
      return res.status(400).json({ error: 'Ağırlık pozitif olmalı' })
    }

    const depo = await findDepoMarket()
    if (!depo) return res.status(404).json({ error: 'DEPO market kaydı bulunamadı' })

    const market = await prisma.market.findUnique({ where: { id: Number(fromMarketId) } })
    if (!market || market.no === 0) {
      return res.status(400).json({ error: 'Geçerli bir bayi seçilmeli' })
    }

    // Fiyat: önce body, sonra bugünün fiyat tablosu, yoksa 0
    let unitPrice = pricePerKg != null ? Number(pricePerKg) : null
    if (unitPrice == null) {
      const now = new Date()
      const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const priceMap = await getPriceMap(new Date(localDateStr))
      const key = qualityId ? `${productId}_${qualityId}` : null
      unitPrice = key ? (priceMap[key] ?? 0) : 0
    }
    const amount = Math.round(unitPrice * w * 100) / 100

    const createdBy = req.user?.name || req.user?.username || 'Depo'

    const product = await prisma.product.findUnique({ where: { id: Number(productId) } })
    if (!product) return res.status(404).json({ error: 'Ürün bulunamadı' })

    const result = await prisma.$transaction(async (tx) => {
      let entry = null
      if (!discarded) {
        // 1. Yeni entry (depoya, vehicleSession yok — iade)
        entry = await tx.entry.create({
          data: {
            vehicleSessionId: null,
            productId: Number(productId),
            qualityId: qualityId ? Number(qualityId) : null,
            producerId: null,
            caseCount: c,
            weight: w,
            weak: !!weak,
            marketId: depo.id,
          },
          include: { product: true, market: true },
        })
      }

      const noteText = note?.trim() ||
        (discarded
          ? `İade (atılan): ${c} kasa ${product.name}, ${w} kg`
          : `İade: ${c} kasa ${product.name} (Entry #${entry.id})`)

      // 2. Ledger: bayi borcu azalır (negatif tutar = kredi notu)
      const ledger = await tx.ledgerEntry.create({
        data: {
          type: 'MARKET_ADJUSTMENT',
          amount: -amount,
          marketId: market.id,
          note: noteText,
          occurredAt: new Date(),
          createdBy,
        },
      })

      // 3. Kasa hareketi: bayiden boş kasalar düşer
      const caseMove = await tx.caseMovement.create({
        data: {
          type: 'MARKET_IN',
          qty: c,
          marketId: market.id,
          note: noteText,
          createdBy,
        },
      })

      // 4. ReturnRecord — 3 kaydı tek doküman altında birleştir
      const ret = await tx.returnRecord.create({
        data: {
          marketId: market.id,
          productId: Number(productId),
          qualityId: qualityId ? Number(qualityId) : null,
          caseCount: c,
          weight: w,
          pricePerKg: unitPrice,
          amount,
          weak: !!weak,
          discarded: !!discarded,
          note: note?.trim() || null,
          entryId: entry?.id ?? null,
          ledgerEntryId: ledger.id,
          caseMovementId: caseMove.id,
          createdBy,
        },
      })

      return { returnRecord: ret, entry, ledger, caseMove, amount, unitPrice, discarded: !!discarded }
    })

    res.status(201).json(result)
  } catch (err) { next(err) }
}

// İade kayıtları listele
export async function listReturns(req, res, next) {
  try {
    const { marketId, dateFrom, dateTo } = req.query
    const where = {}
    if (marketId) where.marketId = Number(marketId)
    if (dateFrom || dateTo) {
      where.createdAt = {}
      if (dateFrom) where.createdAt.gte = new Date(dateFrom)
      if (dateTo) {
        const d = new Date(dateTo); d.setHours(23, 59, 59, 999)
        where.createdAt.lte = d
      }
    }
    const returns = await prisma.returnRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { market: true, product: true, entry: true },
    })
    res.json(returns)
  } catch (err) { next(err) }
}

// İade'yi geri al — bağlı entry/ledger/casemovement hepsi temizlenir
export async function deleteReturn(req, res, next) {
  try {
    const id = Number(req.params.id)
    const ret = await prisma.returnRecord.findUnique({
      where: { id },
      include: { entry: { include: { exitItems: true } } },
    })
    if (!ret) return res.status(404).json({ error: 'İade kaydı bulunamadı' })

    // İade entry'si irsaliyeye dahil edilmişse silinemez
    if (ret.entry?.exitItems?.length > 0) {
      return res.status(409).json({ error: 'Bu iade kaydının ürünü zaten başka bir pazara irsaliye edilmiş — önce o irsaliyeyi sil' })
    }

    await prisma.$transaction(async (tx) => {
      // Önce ReturnRecord'u sil (FK'ler SET NULL, sonra parent kayıtları sil)
      await tx.returnRecord.delete({ where: { id } })
      if (ret.entryId) await tx.entry.delete({ where: { id: ret.entryId } }).catch(() => {})
      if (ret.ledgerEntryId) await tx.ledgerEntry.delete({ where: { id: ret.ledgerEntryId } }).catch(() => {})
      if (ret.caseMovementId) await tx.caseMovement.delete({ where: { id: ret.caseMovementId } }).catch(() => {})
    })

    res.status(204).end()
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
