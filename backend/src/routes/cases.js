// Kasacı Müdür paneli için kısıtlı endpoint'ler.
// requireRole('CASE_MANAGER', 'ADMIN') — admin paneli ledger/finans göremesin.
import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import {
  listMovements,
  createMovement,
  marketBalances,
  driverBalances,
} from '../controllers/caseMovementController.js'

const router = Router()

router.use(requireAuth)

// Bakiye okuma — herhangi authenticated user (operatör badge'i için)
router.get('/balances/drivers', driverBalances)
router.get('/balances/markets', marketBalances)
router.get('/movements', listMovements)

// Hareket ekleme — sadece kasacı veya admin
router.post('/movements', requireRole('CASE_MANAGER', 'ADMIN'), createMovement)

export default router
