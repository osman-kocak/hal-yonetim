import { Router } from 'express'
import { createEntry, createEntryBatch, updateEntry, deleteEntry } from '../controllers/entryController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)
router.post('/', createEntry)
router.post('/batch', createEntryBatch)
router.put('/:id', updateEntry)
router.delete('/:id', deleteEntry)
export default router
