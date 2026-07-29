import { Router } from 'express'
import { getMarkets, getMarketEntries } from '../controllers/marketController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// Bayi listesi = müşteri listesi (ticari sır). Mal kabul/çıkış/transfer/geçmiş
// panelleri kullanıyor → OPERATOR, DEPO, ACCOUNTING, ADMIN. CASE_MANAGER'ın
// ihtiyacı yok (kasacı paneli yalnızca /cases kullanır) — dışlanıyor.
router.use(requireAuth)
router.use(requireRole('OPERATOR', 'DEPO', 'ACCOUNTING', 'ADMIN'))

router.get('/', getMarkets)
router.get('/:id/entries', getMarketEntries)
export default router
