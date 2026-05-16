import { Router } from 'express'
import { prisma } from '../utils/prismaClient.js'
import { getPublicPrices } from '../controllers/priceController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// Tüm public endpoint'ler oturum açmış kullanıcı gerektirir (rol fark etmez)
router.use(requireAuth)

router.get('/drivers', async (req, res, next) => {
  try {
    const drivers = await prisma.driver.findMany({
      orderBy: { name: 'asc' },
      include: {
        vehicleSessions: {
          where: { status: 'ACTIVE' },
          select: { id: true },
          take: 1,
        },
      },
    })
    const result = drivers.map(({ vehicleSessions, ...d }) => ({
      ...d,
      hasActiveSession: vehicleSessions.length > 0,
    }))
    res.json(result)
  } catch (err) { next(err) }
})

router.get('/producers', async (req, res, next) => {
  try {
    const producers = await prisma.producer.findMany({ orderBy: { name: 'asc' } })
    res.json(producers)
  } catch (err) { next(err) }
})

// Bir şoföre atanmış üreticiler
router.get('/drivers/:id/producers', async (req, res, next) => {
  try {
    const driverId = Number(req.params.id)
    if (!Number.isInteger(driverId)) {
      return res.status(400).json({ error: 'Geçersiz şoför kimliği' })
    }
    const producers = await prisma.producer.findMany({
      where: { driverId },
      orderBy: { name: 'asc' },
    })
    res.json(producers)
  } catch (err) { next(err) }
})

router.get('/products', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({ orderBy: { name: 'asc' } })
    res.json(products)
  } catch (err) { next(err) }
})

router.get('/qualities', async (req, res, next) => {
  try {
    const qualities = await prisma.quality.findMany({ orderBy: { name: 'asc' } })
    res.json(qualities)
  } catch (err) { next(err) }
})

// Günlük fiyat map'i (operatör paneli için — auth gerektirmez)
router.get('/prices', getPublicPrices)

export default router
