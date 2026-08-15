import { Router } from 'express'
import { createExit } from '../controllers/exitController.js'
import { removeEntryToDepo, undoRemoveEntryToDepo } from '../controllers/transferController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// İrsaliye kesmek bayiye borç yazar — RoleSelectPage'deki /cikis kartıyla aynı
// roller. Kapı yokken herhangi bir authenticated token finansal kayıt üretebiliyordu.
router.use(requireAuth)
router.use(requireRole('OPERATOR', 'ADMIN'))

router.post('/', createExit)

// Çıkış ekranından kalem kaldırma (depoya geri gönderme) + geri alma.
// Depo rotasında değil burada: işlemi yapan operatör, yetki irsaliye kesmekle aynı.
router.post('/remove-entry', removeEntryToDepo)
router.post('/remove-entry/:id/undo', undoRemoveEntryToDepo)
export default router
