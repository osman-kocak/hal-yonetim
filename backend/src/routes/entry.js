import { Router } from 'express'
import { createEntryBatch, updateEntry, deleteEntry } from '../controllers/entryController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// Mal kabul akışı — RoleSelectPage'deki /mal-kabul kartıyla aynı roller.
// Kapı yokken ACCOUNTING/CASE_MANAGER token'ıyla giriş silinip değiştirilebiliyordu.
router.use(requireAuth)
router.use(requireRole('OPERATOR', 'ADMIN'))

router.post('/batch', createEntryBatch)
router.put('/:id', updateEntry)
router.delete('/:id', deleteEntry)
export default router
