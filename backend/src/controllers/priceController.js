import { prisma } from '../utils/prismaClient.js'

// Belirli bir gün için tüm fiyatları getir (ürün+kalite kombinasyonları)
export async function getPrices(req, res, next) {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date()
    const day = toDay(date)

    const prices = await prisma.price.findMany({
      where: { date: day },
      include: { product: true, quality: true },
      orderBy: [{ product: { name: 'asc' } }, { quality: { name: 'asc' } }],
    })
    res.json(prices)
  } catch (err) { next(err) }
}

// Fiyat kaydet ya da güncelle (upsert)
export async function upsertPrice(req, res, next) {
  try {
    const { productId, qualityId, pricePerKg, date, updatedBy } = req.body
    if (!productId || !qualityId || pricePerKg === undefined || pricePerKg === null) {
      return res.status(400).json({ error: 'productId, qualityId ve pricePerKg zorunludur' })
    }
    const priceValue = Number(pricePerKg)
    if (isNaN(priceValue) || priceValue < 0) {
      return res.status(400).json({ error: 'Fiyat sıfır veya pozitif bir sayı olmalıdır' })
    }
    const day = toDay(date ? new Date(date) : new Date())
    const saved = await prisma.price.upsert({
      where: { productId_qualityId_date: { productId: Number(productId), qualityId: Number(qualityId), date: day } },
      create: { productId: Number(productId), qualityId: Number(qualityId), pricePerKg: priceValue, date: day, updatedBy: updatedBy ?? null },
      update: { pricePerKg: priceValue, updatedBy: updatedBy ?? null },
      include: { product: true, quality: true },
    })
    res.json(saved)
  } catch (err) { next(err) }
}

// Public: belirli tarih için fiyat listesi (auth gerektirmez)
export async function getPublicPrices(req, res, next) {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date()
    const day = toDay(date)
    const prices = await prisma.price.findMany({ where: { date: day } })
    // { "productId_qualityId": pricePerKg }
    res.json(Object.fromEntries(prices.map((p) => [`${p.productId}_${p.qualityId}`, p.pricePerKg])))
  } catch (err) { next(err) }
}

// Belirli tarih için ürün+kalite'ye göre fiyat map'i döndür
// { "productId_qualityId": pricePerKg }
export async function getPriceMap(date) {
  const day = toDay(date ?? new Date())
  const prices = await prisma.price.findMany({ where: { date: day } })
  return Object.fromEntries(prices.map((p) => [`${p.productId}_${p.qualityId}`, p.pricePerKg]))
}

function toDay(date) {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  return d
}
