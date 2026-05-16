import { prisma } from '../utils/prismaClient.js'
import { getPriceMap } from './priceController.js'

export async function createExit(req, res, next) {
  try {
    const { marketId, entryIds } = req.body

    if (!marketId || !entryIds?.length) {
      return res.status(400).json({ error: 'Market ve en az bir ürün seçimi zorunludur' })
    }

    const createdBy = req.body.createdBy ?? 'Operatör'

    // Aynı entry başka irsaliyede var mı?
    const alreadyExited = await prisma.exitItem.findMany({
      where: { entryId: { in: entryIds.map(Number) } },
      select: { entryId: true },
    })
    if (alreadyExited.length) {
      const ids = alreadyExited.map((i) => i.entryId).join(', ')
      return res.status(409).json({ error: `Bazı ürünler zaten irsaliye edilmiş (giriş ID: ${ids})` })
    }

    const now = new Date()
    const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const priceMap = await getPriceMap(new Date(localDateStr))

    const exit = await prisma.$transaction(async (tx) => {
      const created = await tx.exit.create({
        data: {
          marketId: Number(marketId),
          createdBy,
          items: {
            create: entryIds.map((entryId) => ({
              entryId: Number(entryId),
              loaded: true,
            })),
          },
        },
        include: {
          market: true,
          items: {
            include: {
              entry: {
                include: {
                  product: true,
                  quality: true,
                },
              },
            },
          },
        },
      })

      const totalCases = created.items.reduce((s, i) => s + i.entry.caseCount, 0)
      if (totalCases > 0) {
        await tx.caseMovement.create({
          data: {
            type: 'MARKET_OUT',
            qty: totalCases,
            marketId: created.marketId,
            exitId: created.id,
            occurredAt: created.createdAt,
            createdBy,
            note: `İrsaliye #${created.id}`,
          },
        })
      }

      // Finansal cari hesap: irsaliye → bayi borcu (sadece fiyat varsa)
      const invoiceTotal = created.items.reduce((sum, item) => {
        const key = `${item.entry.productId}_${item.entry.qualityId}`
        const price = priceMap[key]
        return price != null ? sum + price * item.entry.weight : sum
      }, 0)
      if (invoiceTotal > 0) {
        await tx.ledgerEntry.create({
          data: {
            type: 'MARKET_INVOICE',
            amount: Math.round(invoiceTotal * 100) / 100,
            marketId: created.marketId,
            exitId: created.id,
            occurredAt: created.createdAt,
            createdBy,
            note: `İrsaliye #${created.id}`,
          },
        })
      }
      return created
    })

    const itemsWithPrice = exit.items.map((item) => {
      const key = `${item.entry.productId}_${item.entry.qualityId}`
      const pricePerKg = priceMap[key] ?? null
      const totalPrice = pricePerKg !== null ? pricePerKg * item.entry.weight : null
      return { ...item, pricePerKg, totalPrice }
    })

    const missingPrices = itemsWithPrice.filter((i) => i.pricePerKg === null).length
    res.status(201).json({ ...exit, items: itemsWithPrice, missingPrices })
  } catch (err) {
    next(err)
  }
}

export async function updateExit(req, res, next) {
  try {
    const { id } = req.params
    const { entryIds } = req.body

    if (!entryIds?.length) {
      return res.status(400).json({ error: 'En az bir ürün seçilmeli' })
    }

    // Exit'in marketId'sini al
    const existingExit = await prisma.exit.findUnique({ where: { id: Number(id) } })
    if (!existingExit) {
      return res.status(404).json({ error: 'İrsaliye bulunamadı' })
    }

    // Seçilen tüm entry'ler bu pazara ait mi?
    const entries = await prisma.entry.findMany({
      where: { id: { in: entryIds.map(Number) } },
      select: { id: true, marketId: true },
    })
    const wrongMarket = entries.filter((e) => e.marketId !== existingExit.marketId)
    if (wrongMarket.length) {
      return res.status(400).json({ error: 'Seçilen girişlerin bir kısmı bu pazara ait değil' })
    }

    const priceMap = await getPriceMap(existingExit.createdAt)
    const editedBy = req.body.editedBy ?? 'Admin'

    const exit = await prisma.$transaction(async (tx) => {
      await tx.exitItem.deleteMany({ where: { exitId: Number(id) } })
      const updated = await tx.exit.update({
        where: { id: Number(id) },
        data: {
          editedAt: new Date(),
          editedBy,
          items: {
            create: entryIds.map((entryId) => ({ entryId: Number(entryId), loaded: true })),
          },
        },
        include: {
          market: true,
          items: {
            include: {
              entry: {
                include: {
                  product: true,
                  quality: true,
                  vehicleSession: { include: { driver: true } },
                },
              },
            },
          },
        },
      })

      // Kasa hareketi senkronize et
      const totalCases = updated.items.reduce((s, i) => s + i.entry.caseCount, 0)
      const existingCase = await tx.caseMovement.findUnique({ where: { exitId: updated.id } })
      if (totalCases > 0) {
        if (existingCase) {
          await tx.caseMovement.update({
            where: { exitId: updated.id },
            data: { qty: totalCases, marketId: updated.marketId },
          })
        } else {
          await tx.caseMovement.create({
            data: {
              type: 'MARKET_OUT',
              qty: totalCases,
              marketId: updated.marketId,
              exitId: updated.id,
              occurredAt: updated.createdAt,
              createdBy: editedBy,
              note: `İrsaliye #${updated.id}`,
            },
          })
        }
      } else if (existingCase) {
        await tx.caseMovement.delete({ where: { exitId: updated.id } })
      }

      // Finansal cari hesap senkronize
      const invoiceTotal = updated.items.reduce((sum, item) => {
        const key = `${item.entry.productId}_${item.entry.qualityId}`
        const price = priceMap[key]
        return price != null ? sum + price * item.entry.weight : sum
      }, 0)
      const roundedInvoice = Math.round(invoiceTotal * 100) / 100
      const existingLedger = await tx.ledgerEntry.findUnique({ where: { exitId: updated.id } })
      if (roundedInvoice > 0) {
        if (existingLedger) {
          await tx.ledgerEntry.update({
            where: { exitId: updated.id },
            data: { amount: roundedInvoice, marketId: updated.marketId },
          })
        } else {
          await tx.ledgerEntry.create({
            data: {
              type: 'MARKET_INVOICE',
              amount: roundedInvoice,
              marketId: updated.marketId,
              exitId: updated.id,
              occurredAt: updated.createdAt,
              createdBy: editedBy,
              note: `İrsaliye #${updated.id}`,
            },
          })
        }
      } else if (existingLedger) {
        await tx.ledgerEntry.delete({ where: { exitId: updated.id } })
      }
      return updated
    })

    const itemsWithPrice = exit.items.map((item) => {
      const key = `${item.entry.productId}_${item.entry.qualityId}`
      const pricePerKg = priceMap[key] ?? null
      const totalPrice = pricePerKg !== null ? pricePerKg * item.entry.weight : null
      return { ...item, pricePerKg, totalPrice }
    })

    res.json({ ...exit, items: itemsWithPrice })
  } catch (err) {
    next(err)
  }
}
