import { Router } from 'express'
import { startVehicle, completeVehicle } from '../controllers/vehicleController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)
router.post('/start', startVehicle)
router.post('/complete', completeVehicle)
export default router
