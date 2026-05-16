import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { listDepoEntries, createTransfer, createGroupedTransfer, createReturn, listReturns, deleteReturn } from '../controllers/transferController.js'

const router = Router()

router.use(requireAuth)
router.use(requireRole('DEPO', 'ADMIN'))

router.get('/entries', listDepoEntries)
router.post('/transfer', createTransfer)
router.post('/transfer-grouped', createGroupedTransfer)
router.post('/return', createReturn)
router.get('/returns', listReturns)
router.delete('/returns/:id', deleteReturn)

export default router
