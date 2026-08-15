// Kasacı Müdür paneli için kısıtlı endpoint'ler.
// requireRole('CASE_MANAGER', 'ADMIN') — admin paneli ledger/finans göremesin.
import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import {
  listMovements,
  createMovement,
  marketBalances,
  regionBalances,
} from '../controllers/caseMovementController.js'

const router = Router()

router.use(requireAuth)

// Bakiye okuma — kasa bakiyeleri finansal veri, OPERATOR/DEPO görmemeli.
// Kapı yokken herhangi authenticated kullanıcı tüm bayi bakiyelerini okuyabiliyordu.
router.get('/balances/markets', requireRole('CASE_MANAGER', 'ADMIN'), marketBalances)
router.get('/balances/regions', requireRole('CASE_MANAGER', 'ADMIN'), regionBalances)
router.get('/movements', requireRole('CASE_MANAGER', 'ADMIN'), listMovements)

// Hareket ekleme — sadece kasacı veya admin
router.post('/movements', requireRole('CASE_MANAGER', 'ADMIN'), createMovement)

export default router
