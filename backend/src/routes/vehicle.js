import { Router } from 'express'
import { startVehicle, completeVehicle, listSessionEntries } from '../controllers/vehicleController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)
router.post('/start', startVehicle)
router.post('/complete', completeVehicle)
router.get('/:id/entries', listSessionEntries)
export default router
