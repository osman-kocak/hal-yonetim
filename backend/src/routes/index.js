import { Router } from 'express'
import regionRoutes from './region.js'
import entryRoutes from './entry.js'
import exitRoutes from './exit.js'
import marketRoutes from './market.js'
import adminRoutes from './admin.js'
import depoRoutes from './depo.js'
import casesRoutes from './cases.js'
import publicRoutes from './public.js'
import { hidePurchasePrices } from '../middleware/purchaseGuard.js'

const router = Router()

// Bağlantı yoklaması. Kök /health web server'da backend'e proxy'lenmiyor,
// SPA fallback'e düşüp 200 + HTML dönüyordu — istemci bunu "bağlantı iyi"
// sanıyordu. /api altındaki bu kopya gerçekten backend'e ulaşıyor.
// Auth YOK: yoklama oturum açmadan da çalışmalı (bkz. store/connectionStore.js).
router.get('/health', (req, res) => res.json({ ok: true, at: new Date().toISOString() }))

// ALIŞ FİYATI KORUMASI — /admin DIŞINDAKİ her şeye takılı, fail-closed.
// Buranın altındaki router'lar saha rollerine açık; alış fiyatı ticari sır ve
// yanıtları iPad'in IndexedDB'sine cache'leniyor, bir kez sızarsa geri alınamaz.
// Yeni bir saha router'ı eklenirse bu satırın ALTINA konmalı — üstüne konursa
// koruma dışında kalır. Gerekçe: middleware/purchaseGuard.js
// /admin guard'ın ÜSTÜNDE: muhasebe ve yönetim ekranları alış fiyatını
// GÖRMEK ZORUNDA (fiyat girişi, üretici ödeme paneli, mal kabul dökümü).
// Zaten requireRole('ADMIN','ACCOUNTING') arkasında.
router.use('/admin', adminRoutes)

router.use(hidePurchasePrices)

router.use('/region', regionRoutes)
router.use('/entry', entryRoutes)
router.use('/exit', exitRoutes)
router.use('/markets', marketRoutes)
router.use('/depo', depoRoutes)
router.use('/cases', casesRoutes)
router.use('/', publicRoutes)
export default router
