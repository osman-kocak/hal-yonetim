import { Router } from 'express'
import regionRoutes from './region.js'
import entryRoutes from './entry.js'
import exitRoutes from './exit.js'
import marketRoutes from './market.js'
import adminRoutes from './admin.js'
import depoRoutes from './depo.js'
import casesRoutes from './cases.js'
import publicRoutes from './public.js'

const router = Router()

// Bağlantı yoklaması. Kök /health web server'da backend'e proxy'lenmiyor,
// SPA fallback'e düşüp 200 + HTML dönüyordu — istemci bunu "bağlantı iyi"
// sanıyordu. /api altındaki bu kopya gerçekten backend'e ulaşıyor.
// Auth YOK: yoklama oturum açmadan da çalışmalı (bkz. store/connectionStore.js).
router.get('/health', (req, res) => res.json({ ok: true, at: new Date().toISOString() }))

router.use('/region', regionRoutes)
router.use('/entry', entryRoutes)
router.use('/exit', exitRoutes)
router.use('/markets', marketRoutes)
router.use('/admin', adminRoutes)
router.use('/depo', depoRoutes)
router.use('/cases', casesRoutes)
router.use('/', publicRoutes)
export default router
