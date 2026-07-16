import { Router } from 'express'
import { startRegion, completeRegion, listSessionEntries } from '../controllers/regionController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)
router.post('/start', startRegion)
router.post('/complete', completeRegion)
router.get('/:id/entries', listSessionEntries)
export default router
