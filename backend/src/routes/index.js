import { Router } from 'express'
import vehicleRoutes from './vehicle.js'
import entryRoutes from './entry.js'
import exitRoutes from './exit.js'
import marketRoutes from './market.js'
import adminRoutes from './admin.js'
import depoRoutes from './depo.js'
import casesRoutes from './cases.js'
import publicRoutes from './public.js'

const router = Router()
router.use('/vehicle', vehicleRoutes)
router.use('/entry', entryRoutes)
router.use('/exit', exitRoutes)
router.use('/markets', marketRoutes)
router.use('/admin', adminRoutes)
router.use('/depo', depoRoutes)
router.use('/cases', casesRoutes)
router.use('/', publicRoutes)
export default router
