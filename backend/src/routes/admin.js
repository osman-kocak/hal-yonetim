import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { login, me, driverCrud, producerCrud, productCrud, qualityCrud, marketCrud, userCrud } from '../controllers/adminController.js'
import { listTransfers } from '../controllers/transferController.js'
import {
  listEntries as listLedger,
  createEntry as createLedger,
  deleteEntry as deleteLedger,
  marketBalances as ledgerMarketBalances,
  producerBalances as ledgerProducerBalances,
  financialReport,
} from '../controllers/ledgerController.js'
import {
  overview as analyticsOverview,
  trend as analyticsTrend,
  byDriver as analyticsByDriver,
  byMarket as analyticsByMarket,
  byProduct as analyticsByProduct,
  quality as analyticsQuality,
} from '../controllers/analyticsController.js'
import { dailyReport, byMarketReport, byProductReport, topProducts } from '../controllers/reportController.js'
import { getPrices, upsertPrice } from '../controllers/priceController.js'
import { getExitHistory, getEntryHistory } from '../controllers/historyController.js'
import { updateExit, deleteExit } from '../controllers/exitController.js'
import {
  listMovements,
  createMovement,
  deleteMovement,
  marketBalances,
  driverBalances,
} from '../controllers/caseMovementController.js'

const router = Router()

// Login rate limiter — in-process, 10 deneme / 15 dakika per IP
const loginAttempts = new Map()
function loginRateLimit(req, res, next) {
  const ip = req.ip ?? 'unknown'
  const now = Date.now()
  const windowMs = 15 * 60 * 1000
  const maxAttempts = 10
  const record = loginAttempts.get(ip) ?? { count: 0, resetAt: now + windowMs }
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs }
  record.count += 1
  loginAttempts.set(ip, record)
  if (record.count > maxAttempts) {
    return res.status(429).json({ error: 'Çok fazla deneme. 15 dakika bekleyin.' })
  }
  next()
}

// Public
router.post('/auth/login', loginRateLimit, login)

// Protected – all below require JWT + ADMIN veya ACCOUNTING rolü
router.use(requireAuth)
router.get('/auth/me', me)
router.use(requireRole('ADMIN', 'ACCOUNTING'))

// Drivers
router.get('/drivers', driverCrud.getAll)
router.post('/drivers', driverCrud.create)
router.put('/drivers/:id', driverCrud.update)
router.delete('/drivers/:id', driverCrud.remove)

// Producers
router.get('/producers', producerCrud.getAll)
router.post('/producers', producerCrud.create)
router.put('/producers/:id', producerCrud.update)
router.delete('/producers/:id', producerCrud.remove)

// Products
router.get('/products', productCrud.getAll)
router.post('/products', productCrud.create)
router.put('/products/:id', productCrud.update)
router.delete('/products/:id', productCrud.remove)

// Qualities
router.get('/qualities', qualityCrud.getAll)
router.post('/qualities', qualityCrud.create)
router.put('/qualities/:id', qualityCrud.update)
router.delete('/qualities/:id', qualityCrud.remove)

// Markets
router.get('/markets', marketCrud.getAll)
router.post('/markets', marketCrud.create)
router.put('/markets/:id', marketCrud.update)
router.delete('/markets/:id', marketCrud.remove)

// Users (operatörler)
router.get('/users', userCrud.getAll)
router.post('/users', userCrud.create)
router.put('/users/:id', userCrud.update)
router.delete('/users/:id', userCrud.remove)

// Prices
router.get('/prices', getPrices)
router.post('/prices', upsertPrice)

// History / Takip
router.get('/history/exits', getExitHistory)
router.get('/history/entries', getEntryHistory)
router.put('/exits/:id', updateExit)
router.delete('/exits/:id', deleteExit)

// Transferler (geçmiş)
router.get('/transfers', listTransfers)

// Finansal cari hesap
router.get('/ledger', listLedger)
router.post('/ledger', createLedger)
router.delete('/ledger/:id', deleteLedger)
router.get('/ledger/balances/markets', ledgerMarketBalances)
router.get('/ledger/balances/producers', ledgerProducerBalances)
router.get('/ledger/report', financialReport)

// Case movements (kasa takip)
router.get('/case-movements', listMovements)
router.post('/case-movements', createMovement)
router.delete('/case-movements/:id', deleteMovement)
router.get('/case-balances/markets', marketBalances)
router.get('/case-balances/drivers', driverBalances)

// Analytics (Dashboard)
router.get('/analytics/overview', analyticsOverview)
router.get('/analytics/trend', analyticsTrend)
router.get('/analytics/by-driver', analyticsByDriver)
router.get('/analytics/by-market', analyticsByMarket)
router.get('/analytics/by-product', analyticsByProduct)
router.get('/analytics/quality', analyticsQuality)

// Reports
router.get('/reports/daily', dailyReport)
router.get('/reports/by-market', byMarketReport)
router.get('/reports/by-product', byProductReport)
router.get('/reports/top-products', topProducts)

export default router
