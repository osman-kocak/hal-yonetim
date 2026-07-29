import { Router } from 'express'
import { prisma } from '../utils/prismaClient.js'
import { getPublicPrices } from '../controllers/priceController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// Referans verisi (bölge/üretici/ürün/fiyat) — mal kabul ve çıkış akışları
// kullanıyor. CASE_MANAGER'ın hiçbirine ihtiyacı yok, dışlanıyor. Fiyat
// tablosu ticari sır; geçmiş tarih sorgusu ayrıca controller'da ADMIN'e kısıtlı.
router.use(requireAuth)
router.use(requireRole('OPERATOR', 'DEPO', 'ACCOUNTING', 'ADMIN'))

router.get('/regions', async (req, res, next) => {
  try {
    const regions = await prisma.region.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      include: {
        regionSessions: {
          where: { status: 'ACTIVE' },
          select: { id: true },
          take: 1,
        },
      },
    })
    const result = regions.map(({ regionSessions, ...r }) => ({
      ...r,
      hasActiveSession: regionSessions.length > 0,
    }))
    res.json(result)
  } catch (err) { next(err) }
})

// Bir bölgenin üreticileri: o bölgeye atanmış olanlar + her bölgede görünenler.
// OR sayesinde ikisini birden sağlayan üretici tek kez döner, dedupe gerekmez.
router.get('/regions/:id/producers', async (req, res, next) => {
  try {
    const regionId = Number(req.params.id)
    if (!Number.isInteger(regionId)) {
      return res.status(400).json({ error: 'Geçersiz bölge kimliği' })
    }
    const producers = await prisma.producer.findMany({
      where: {
        active: true,
        OR: [{ regionId }, { allRegions: true }],
      },
      // allRegions olan hep en üstte — operatörün kas hafızası sabit kalsın
      orderBy: [{ allRegions: 'desc' }, { name: 'asc' }],
    })
    res.json(producers)
  } catch (err) { next(err) }
})

router.get('/products', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      orderBy: [
        { entries: { _count: 'desc' } },
        { name: 'asc' },
      ],
    })
    res.json(products)
  } catch (err) { next(err) }
})

// Günlük fiyat map'i (operatör paneli için)
router.get('/prices', getPublicPrices)

export default router
