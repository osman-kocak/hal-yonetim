import { Router } from 'express'
import { startRegion, completeRegion, listSessionEntries } from '../controllers/regionController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// Bölge oturumu mal kabul akışının parçası — /mal-kabul ile aynı roller
router.use(requireAuth)
router.use(requireRole('OPERATOR', 'ADMIN'))

router.post('/start', startRegion)
router.post('/complete', completeRegion)
router.get('/:id/entries', listSessionEntries)
export default router
