import { Router } from 'express'
import { getMarkets, getMarketEntries } from '../controllers/marketController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)
router.get('/', getMarkets)
router.get('/:id/entries', getMarketEntries)
export default router
