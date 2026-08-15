import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import {
  listDepoEntries, createGroupedTransfer, createReturn, createReturnBatch,
  listReturns, deleteReturn, marketProductBalance,
} from '../controllers/transferController.js'

const router = Router()

router.use(requireAuth)
router.use(requireRole('DEPO', 'ADMIN'))

router.get('/entries', listDepoEntries)
router.post('/transfer-grouped', createGroupedTransfer)
router.post('/return', createReturn)
// Tek bayi, çok satır — hepsi tek transaction'da (bkz. createReturnBatch)
router.post('/return/batch', createReturnBatch)
// İade ekranı: bayiye son 7 günde ne gönderilmiş, ne iade alınmış
router.get('/market-balance/:id', marketProductBalance)
router.get('/returns', listReturns)
router.delete('/returns/:id', deleteReturn)

export default router
