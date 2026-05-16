import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { listDepoEntries, createTransfer } from '../controllers/transferController.js'

const router = Router()

router.use(requireAuth)
router.use(requireRole('DEPO', 'ADMIN'))

router.get('/entries', listDepoEntries)
router.post('/transfer', createTransfer)

export default router
