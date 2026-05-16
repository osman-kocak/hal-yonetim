import { Router } from 'express'
import { createEntry, createEntryBatch } from '../controllers/entryController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)
router.post('/', createEntry)
router.post('/batch', createEntryBatch)
export default router
