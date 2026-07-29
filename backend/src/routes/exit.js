import { Router } from 'express'
import { createExit } from '../controllers/exitController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// İrsaliye kesmek bayiye borç yazar — RoleSelectPage'deki /cikis kartıyla aynı
// roller. Kapı yokken herhangi bir authenticated token finansal kayıt üretebiliyordu.
router.use(requireAuth)
router.use(requireRole('OPERATOR', 'ADMIN'))

router.post('/', createExit)
export default router
