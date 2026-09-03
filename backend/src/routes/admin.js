import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { login, me, regionCrud, producerCrud, productCrud, qualityCrud, marketCrud, userCrud } from '../controllers/adminController.js'
import { listTransfers, listDepoEntries, listReturns, deleteReturn } from '../controllers/transferController.js'
import { createManualDepoEntry } from '../controllers/entryController.js'
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
  byRegion as analyticsByRegion,
  byMarket as analyticsByMarket,
  byProduct as analyticsByProduct,
  quality as analyticsQuality,
} from '../controllers/analyticsController.js'
import { dailyReport, byMarketReport, byProductReport, topProducts, fireReport } from '../controllers/reportController.js'
import { getPrices, upsertPrice } from '../controllers/priceController.js'
import {
  getPurchasePrices, upsertPurchasePrice,
  getProducerPrices, upsertProducerPrice, cancelProducerPrice,
} from '../controllers/purchasePriceController.js'
import {
  balances as producerBalancesRich, summary as producerPaymentSummary,
  statement as producerStatement, intakes as producerIntakes,
  createPayment as createProducerPayment, createPaymentBatch as createProducerPaymentBatch,
  listPayments as listProducerPayments, unpriced as unpricedIntakes,
  recalculate as recalcProducerDebts, assignProducer as assignEntryProducer,
} from '../controllers/producerPaymentController.js'
import { logExport, listAuditLogs } from '../controllers/auditController.js'
import { listOutages } from '../controllers/outageController.js'
import { getExitHistory, getEntryHistory, getDepoHistory } from '../controllers/historyController.js'
import { updateExit, deleteExit } from '../controllers/exitController.js'
import {
  invoiceQueue, setInvoiceNo, clearInvoiceNo, markPrinted, setExitPrices,
} from '../controllers/exitInvoiceController.js'
import {
  listMovements,
  createMovement,
  deleteMovement,
  marketBalances,
  regionBalances,
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

// Regions
router.get('/regions', regionCrud.getAll)
router.post('/regions', regionCrud.create)
router.put('/regions/:id', regionCrud.update)
router.delete('/regions/:id', regionCrud.remove)

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

// Prices — SATIŞ fiyatı (bayiye kesilen irsaliye)
router.get('/prices', getPrices)
router.post('/prices', upsertPrice)

// ——— Üretici Ödeme Paneli ———
//
// ROL: ADMIN + ACCOUNTING (router seviyesinde zaten böyle). adminOnly YAPILMADI
// — üreticiye ödeme yapmak muhasebecinin ASIL işi, gizlemek ekranı işlevsiz
// kılar. Ama YIKICI iki işlem ADMIN'e kısıtlı: toplu yeniden hesaplama para
// yazıyor, geri alması elle temizlik gerektirir.
router.get('/producer-payments/summary', producerPaymentSummary)
router.get('/producer-payments/balances', producerBalancesRich)
router.get('/producer-payments/payments', listProducerPayments)
router.get('/producer-payments/unpriced', unpricedIntakes)
router.post('/producer-payments/recalculate', requireRole('ADMIN'), recalcProducerDebts)
// Toplu ödeme TEK uç: frontend'de N ayrı POST atılırsa 12 ödemenin 7'si yazılıp
// 5'i patladığında telafisi olmayan yarım kayıt kalır. Tek transaction şart.
router.post('/producer-payments/batch', createProducerPaymentBatch)
router.get('/producer-payments/:id/statement', producerStatement)
router.get('/producer-payments/:id/intakes', producerIntakes)
router.post('/producer-payments/:id/payment', createProducerPayment)
// Üreticisiz mal kabule üretici ata → borcu doğur
router.patch('/entries/:id/producer', assignEntryProducer)

// Purchase prices — ALIŞ fiyatı (üreticiye ödenen). Satış fiyatından bağımsız.
//
// YALNIZ /api/admin ALTINDA: alış fiyatı ticari sır, saha rollerinin işi değil.
// /api/public veya /api/entry'ye karşılığı EKLENMEZ — operatörün alış fiyatını
// görmesine gerek yok, fiyatı o giremez. (Aynı gerekçe: middleware/purchaseGuard.js)
router.get('/purchase-prices', getPurchasePrices)
router.post('/purchase-prices', upsertPurchasePrice)
router.get('/purchase-prices/producer/:producerId', getProducerPrices)
router.post('/purchase-prices/producer', upsertProducerPrice)
// Kaldırma DELETE değil POST /cancel: satır silinmiyor, cancelled=true mezar
// taşı bırakılıyor — yoksa carry-forward bir önceki fiyatı diriltir.
router.post('/purchase-prices/producer/:id/cancel', cancelProducerPrice)

// History / Takip
router.get('/history/exits', getExitHistory)
router.get('/history/entries', getEntryHistory)
router.put('/exits/:id', updateExit)
router.delete('/exits/:id', deleteExit)

// ——— Legal fatura eşleştirmesi ———
//
// ROL: ADMIN + ACCOUNTING (router seviyesinde zaten böyle). Fatura numarasını
// irsaliyeyle eşleştirmek muhasebenin ASIL işi; adminOnly yapmak muhasebeciyi
// her fatura için yöneticiye bağımlı kılardı.
//
// TEK İSTİSNA onayı GERİ ALMA: numarayı düzeltmek muhasebe işi, eşleştirmeyi
// tamamen koparmak resmi evrakla irsaliye arasındaki bağı siler.
router.get('/exits/invoice-queue', invoiceQueue)
router.post('/exits/:id/invoice', setInvoiceNo)
// Fiyat düzeltmesi onay ekranından: fişin gün fiyatını, kalem snapshot'larını
// ve bayi borcunu TEK transaction'da günceller (bkz. setExitPrices).
router.post('/exits/:id/prices', setExitPrices)
router.delete('/exits/:id/invoice', requireRole('ADMIN'), clearInvoiceNo)
// Takip ekranından yeniden baskı da rozeti günceller.
router.post('/exits/:id/printed', markPrinted)

// Transferler (geçmiş)
router.get('/transfers', listTransfers)

// Depo — muhasebe de görebilsin diye admin altında (saha /api/depo yalnızca
// DEPO+ADMIN'e açık, ACCOUNTING oraya erişemiyor).
router.get('/depo/entries', listDepoEntries)
router.post('/depo/entry', createManualDepoEntry)
// Depo hareket defteri — stok ekranı "şu an ne var"ı, bu uç "ne girdi/ne çıktı"yı
// gösterir. İkisi ayrı sorular; gün içinde girip çıkan mal stokta hiç görünmez.
router.get('/depo/history', getDepoHistory)

// İadeler (admin paneli /admin/iadeler) — aynı gerekçe: saha /api/depo yalnızca
// DEPO+ADMIN'e açık, muhasebeci oradan 403 alıyordu. İADE OLUŞTURMA burada YOK
// ve eklenmemeli: iade fiziksel mal kabulü, sahada tartılarak girilir.
// Silme ACCOUNTING'e de açık — iade silmek cari borcu geri alıyor, bu muhasebe
// işi (deleteLedger / deleteExit ile aynı yetki seviyesi).
router.get('/returns', listReturns)
router.delete('/returns/:id', deleteReturn)

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
router.get('/case-balances/regions', regionBalances)

// Analytics (Dashboard)
router.get('/analytics/overview', analyticsOverview)
router.get('/analytics/trend', analyticsTrend)
router.get('/analytics/by-region', analyticsByRegion)
router.get('/analytics/by-market', analyticsByMarket)
router.get('/analytics/by-product', analyticsByProduct)
router.get('/analytics/quality', analyticsQuality)

// Reports
router.get('/reports/daily', dailyReport)
router.get('/reports/by-market', byMarketReport)
router.get('/reports/by-product', byProductReport)
router.get('/reports/top-products', topProducts)
router.get('/reports/fire', fireReport)

// Denetim (audit) — export niyeti kaydı ADMIN+ACCOUNTING; kayıtları görme ADMIN'e özel
router.post('/audit/export', logExport)
router.get('/audit', requireRole('ADMIN'), listAuditLogs)

// Saha kesinti ölçümü — offline yatırım kararının dayanağı (Faz 0).
// ACCOUNTING de görebilir: kesinti süresi operasyonel bir maliyet.
router.get('/outages', listOutages)

export default router
