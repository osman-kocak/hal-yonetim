import { prisma } from '../utils/prismaClient.js'
import { toPriceDate, localDateString } from '../utils/date.js'

// Belirli bir gün için tüm fiyatları getir (ürün+kalite kombinasyonları)
export async function getPrices(req, res, next) {
  try {
    const day = toDay(req.query.date)
    if (!day) return res.status(400).json({ error: 'Tarih geçersiz' })

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
    const day = toDay(date)
    if (!day) return res.status(400).json({ error: 'Tarih geçersiz' })
    const saved = await prisma.price.upsert({
      where: { productId_qualityId_date: { productId: Number(productId), qualityId: Number(qualityId), date: day } },
      create: { productId: Number(productId), qualityId: Number(qualityId), pricePerKg: priceValue, date: day, updatedBy: updatedBy ?? null },
      update: { pricePerKg: priceValue, updatedBy: updatedBy ?? null },
      include: { product: true, quality: true },
    })
    res.json(saved)
  } catch (err) { next(err) }
}

// Operatör paneli için günlük fiyat map'i. Fiyat = ticari sır; operatör
// yalnızca BUGÜNÜN fiyatına ihtiyaç duyar. Geçmiş tarih zaman serisi kurup
// fiyat politikasını dışarı çıkarmaya yarar — bu yüzden geçmiş sorgu ADMIN/
// ACCOUNTING'e kısıtlı.
export async function getPublicPrices(req, res, next) {
  try {
    const day = toDay(req.query.date)
    if (!day) return res.status(400).json({ error: 'Tarih geçersiz' })

    if (req.query.date && req.query.date !== localDateString()) {
      const roles = Array.isArray(req.user?.roles) ? req.user.roles : []
      const privileged = roles.some((r) => ['ADMIN', 'ACCOUNTING'].includes(String(r).toUpperCase()))
      if (!privileged) {
        return res.status(403).json({ error: 'Geçmiş tarih fiyatlarına erişim yetkiniz yok' })
      }
    }

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

// toDay() new Date()'i doğrudan UTC gün başına yuvarlıyordu: TR'de gece
// 00:00-03:00 arasında UTC hâlâ önceki gün olduğu için fiyatlar bir gün
// geriden okunuyordu. toPriceDate() yerel takvim gününü baz alır.
// Geçersiz tarihte null döner — çağıran 400 verebilsin diye.
function toDay(date) {
  return toPriceDate(date ?? new Date())
}
