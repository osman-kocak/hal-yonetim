import { prisma } from '../utils/prismaClient.js'
import { getPriceMap } from './priceController.js'
import {
  isSpecialMarket, findDepoMarket, findDiscardMarket, DISCARD_NO,
} from '../utils/markets.js'
import { toPriceDate, startOfLocalDay, endOfLocalDay } from '../utils/date.js'

// errorHandler err.status'ü okur — transaction içinden anlamlı HTTP kodu fırlatmak için
function httpError(status, message) {
  const e = new Error(message)
  e.status = status
  return e
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
        regionSession: { include: { region: true } },
      },
    })
    res.json({ depoId: depo.id, entries })
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

    // Depodaki mal da dökülebilir: 99'a transfer = imha. Entry'nin source'u
    // DISCARD olmalı ki fire raporuna girsin ve mal kabul hacmine sayılmasın.
    const toDiscard = target.no === DISCARD_NO

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
      // Aday listesi ve stok tx İÇİNDE yeniden okunur. Yukarıdaki okuma bayat
      // olabilir: iki depocu aynı anda transfer başlatırsa ikisi de eski
      // caseCount'u görür, guard'sız update birbirini ezer ve kasa çoğalır.
      const freshCandidates = await tx.entry.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: { exitItems: { select: { id: true } } },
      })
      const availableNow = freshCandidates.reduce((s, e) => s + e.caseCount, 0)
      if (totalRequested > availableNow) {
        throw httpError(409, `Depoda sadece ${availableNow} kasa kaldı, ${totalRequested} talep edildi`)
      }

      const results = []
      let remaining = totalRequested

      for (const entry of freshCandidates) {
        if (remaining <= 0) break
        if (entry.exitItems.length > 0) continue

        const takeQty = Math.min(remaining, entry.caseCount)
        const fullEntry = takeQty === entry.caseCount

        if (fullEntry) {
          // Entry tamamen hedefe taşınır — koşullu update ile (atomik CAS)
          const moved = await tx.entry.updateMany({
            where: { id: entry.id, marketId: depo.id, caseCount: takeQty },
            data: { marketId: Number(toMarketId), ...(toDiscard && { source: 'DISCARD' }) },
          })
          if (moved.count === 0) {
            throw httpError(409, 'Depo stoğu işlem sırasında değişti, tekrar deneyin')
          }
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
          results.push(t)
        } else {
          // Entry split
          const ratio = takeQty / entry.caseCount
          const transferWeight = Math.round(entry.weight * ratio * 100) / 100
          const remainingWeight = Math.round((entry.weight - transferWeight) * 100) / 100
          const remainingCases = entry.caseCount - takeQty

          const reduced = await tx.entry.updateMany({
            where: { id: entry.id, marketId: depo.id, caseCount: entry.caseCount },
            data: { caseCount: remainingCases, weight: remainingWeight },
          })
          if (reduced.count === 0) {
            throw httpError(409, 'Depo stoğu işlem sırasında değişti, tekrar deneyin')
          }

          const newEntry = await tx.entry.create({
            data: {
              regionSessionId: entry.regionSessionId,
              productId: entry.productId,
              producerId: entry.producerId,
              qualityId: entry.qualityId,
              caseCount: takeQty,
              weight: transferWeight,
              weak: entry.weak,
              source: toDiscard ? 'DISCARD' : entry.source,
              marketId: Number(toMarketId),
            },
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

// Bayiden iade kabul. Mal üç yerden birine gider:
//   DEPO     → depoya alınır, sonra normal transferle sevk edilebilir
//   MARKET   → doğrudan başka bir bayiye yönlendirilir (+ Transfer kaydı)
//   DISCARD  → imha, 99 ATILAN pazarına yazılır (fire raporlanabilsin diye)
// Üç durumda da bayi borcundan düşülür ve boş kasa iadesi işlenir.
export async function createReturn(req, res, next) {
  try {
    const {
      fromMarketId, productId, caseCount, weight, weak,
      destination, toMarketId, discarded, pricePerKg, note, qualityId,
    } = req.body
    if (!fromMarketId || !productId || !caseCount || !weight) {
      return res.status(400).json({ error: 'Bayi, ürün, kasa ve ağırlık zorunlu' })
    }

    // discarded eski istemciler için korunuyor; destination verilmişse o kazanır
    const dest = destination ?? (discarded ? 'DISCARD' : 'DEPO')
    if (!['DEPO', 'MARKET', 'DISCARD'].includes(dest)) {
      return res.status(400).json({ error: 'Geçersiz iade hedefi' })
    }

    const c = Number(caseCount)
    const w = Number(weight)
    if (!Number.isInteger(c) || c < 1) {
      return res.status(400).json({ error: 'Kasa adedi pozitif tam sayı olmalı' })
    }
    if (!Number.isFinite(w) || w <= 0) {
      return res.status(400).json({ error: 'Ağırlık pozitif olmalı' })
    }

    const market = await prisma.market.findUnique({ where: { id: Number(fromMarketId) } })
    if (!market || isSpecialMarket(market)) {
      return res.status(400).json({ error: 'Geçerli bir bayi seçilmeli' })
    }

    // Hedef pazarı belirle
    let targetMarket = null
    if (dest === 'DEPO') {
      targetMarket = await findDepoMarket()
      if (!targetMarket) return res.status(404).json({ error: 'DEPO market kaydı bulunamadı' })
    } else if (dest === 'DISCARD') {
      targetMarket = await findDiscardMarket()
      if (!targetMarket) {
        return res.status(404).json({ error: `İmha pazarı (no ${DISCARD_NO}) tanımlı değil` })
      }
    } else {
      if (!toMarketId) return res.status(400).json({ error: 'Hedef pazar seçilmeli' })
      targetMarket = await prisma.market.findUnique({ where: { id: Number(toMarketId) } })
      if (!targetMarket) return res.status(404).json({ error: 'Hedef pazar bulunamadı' })
      if (isSpecialMarket(targetMarket)) {
        return res.status(400).json({ error: 'Hedef normal bir bayi olmalı' })
      }
      if (targetMarket.id === market.id) {
        return res.status(400).json({ error: 'Hedef, iadeyi veren bayiden farklı olmalı' })
      }
    }

    // Fiyat: önce body, sonra bugünün fiyat tablosu
    let unitPrice = pricePerKg != null ? Number(pricePerKg) : null
    let priceMissing = false
    if (unitPrice == null) {
      const priceMap = await getPriceMap(toPriceDate())
      const key = qualityId ? `${productId}_${qualityId}` : null
      const found = key ? priceMap[key] : undefined
      // Fiyat bulunamazsa 0 yazılıp sessizce geçilirdi: iade kaydedilir ama
      // bayinin borcundan hiçbir şey düşmezdi. Artık istemciye haber veriyoruz.
      priceMissing = found == null
      unitPrice = found ?? 0
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return res.status(400).json({ error: 'Fiyat geçersiz' })
    }
    const amount = Math.round(unitPrice * w * 100) / 100

    const createdBy = req.user?.name || req.user?.username || 'Depo'

    const product = await prisma.product.findUnique({ where: { id: Number(productId) } })
    if (!product) return res.status(404).json({ error: 'Ürün bulunamadı' })

    const result = await prisma.$transaction(async (tx) => {
      // İmha da dahil her durumda entry oluşur. Eskiden imhada hiç entry
      // yazılmıyordu — mal kayıtlardan buharlaşıyor, fire raporlanamıyordu.
      const entry = await tx.entry.create({
        data: {
          regionSessionId: null,
          productId: Number(productId),
          qualityId: qualityId ? Number(qualityId) : null,
          producerId: null,
          caseCount: c,
          weight: w,
          weak: !!weak,
          source: dest === 'DISCARD' ? 'DISCARD' : 'RETURN',
          marketId: targetMarket.id,
        },
        include: { product: true, market: true },
      })

      // Başka bayiye yönlendirme izlenebilir olmalı — Transfer kaydı bırak
      if (dest === 'MARKET') {
        await tx.transfer.create({
          data: {
            entryId: entry.id,
            fromMarketId: market.id,
            toMarketId: targetMarket.id,
            note: `İade yönlendirme: ${c} kasa ${product.name}`,
            createdBy,
          },
        })
      }

      const destLabel = dest === 'DISCARD'
        ? 'imha'
        : dest === 'MARKET' ? `→ ${targetMarket.name}` : 'depoya'
      const noteText = note?.trim() ||
        `İade (${destLabel}): ${c} kasa ${product.name}, ${w} kg (Entry #${entry.id})`

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
          discarded: dest === 'DISCARD',
          note: note?.trim() || null,
          entryId: entry.id,
          ledgerEntryId: ledger.id,
          caseMovementId: caseMove.id,
          createdBy,
        },
      })

      return { returnRecord: ret, entry, ledger, caseMove, amount, unitPrice }
    })

    res.status(201).json({
      ...result,
      destination: dest,
      targetMarket: { id: targetMarket.id, no: targetMarket.no, name: targetMarket.name },
      // İstemci uyarı gösterebilsin: fiyat bulunamadıysa borçtan 0₺ düşüldü
      priceMissing,
    })
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
      // new Date('2026-07-21') UTC gece yarısıdır; .setHours() yerel saat uygular
      // → TR'de üst sınır 20:59'a düşüp günün son 3 saati filtreden kayboluyordu
      if (dateFrom) where.createdAt.gte = startOfLocalDay(dateFrom)
      if (dateTo) where.createdAt.lte = endOfLocalDay(dateTo)
    }
    const returns = await prisma.returnRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      // entry.market: iadenin nereye gittiği (depo / başka pazar / 99 ATILAN)
      include: { market: true, product: true, entry: { include: { market: true } } },
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
      include: {
        entry: {
          include: {
            exitItems: { select: { id: true } },
            transfers: { select: { id: true } },
          },
        },
      },
    })
    if (!ret) return res.status(404).json({ error: 'İade kaydı bulunamadı' })

    // Engeller transaction'a GİRMEDEN kontrol edilmeli. Postgres'te tx içinde bir
    // statement hata alırsa tx abort durumuna geçer — .catch() hatayı yutsa bile
    // sonraki sorgu "current transaction is aborted" ile patlar ve her şey geri
    // alınır. Yani eskiden FK'ye takılan iade hiç silinemiyor, 500 dönüyordu.
    if (ret.entry?.exitItems?.length > 0) {
      return res.status(409).json({
        error: 'Bu iadenin ürünü irsaliye edilmiş — önce o irsaliyeyi silin',
      })
    }
    if (ret.entry?.transfers?.length > 0) {
      return res.status(409).json({
        error: 'Bu iadenin ürünü başka bir pazara transfer edilmiş — önce o transferi geri alın',
      })
    }
    // Kısmî sevkiyat: entry split edilmişse kasa sayısı iadedekinden az olur.
    // Kalanı silmek stoğu bozar — düzeltme kaydı girilmeli.
    if (ret.entry && ret.entry.caseCount !== ret.caseCount) {
      return res.status(409).json({
        error: 'Bu iadenin malı kısmen sevk edilmiş — kayıt silinemez, düzeltme kaydı girin',
      })
    }

    await prisma.$transaction(async (tx) => {
      // Sıra önemli: ReturnRecord'un FK'leri SetNull olduğu için önce o silinir,
      // sonra bağlı kayıtlar. catch YOK — hata olursa tx tümüyle geri alınmalı.
      await tx.returnRecord.delete({ where: { id } })
      if (ret.entryId) await tx.entry.delete({ where: { id: ret.entryId } })
      if (ret.ledgerEntryId) await tx.ledgerEntry.delete({ where: { id: ret.ledgerEntryId } })
      if (ret.caseMovementId) await tx.caseMovement.delete({ where: { id: ret.caseMovementId } })
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
      // new Date('2026-07-21') UTC gece yarısıdır; .setHours() yerel saat uygular
      // → TR'de üst sınır 20:59'a düşüp günün son 3 saati filtreden kayboluyordu
      if (dateFrom) where.createdAt.gte = startOfLocalDay(dateFrom)
      if (dateTo) where.createdAt.lte = endOfLocalDay(dateTo)
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
