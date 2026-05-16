import { Router } from 'express'
import { createExit } from '../controllers/exitController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)
router.post('/', createExit)
export default router
