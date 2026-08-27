import { Router } from 'express'
import { createExit } from '../controllers/exitController.js'
import { markPrinted } from '../controllers/exitInvoiceController.js'
import { acquireLock, releaseLock } from '../controllers/exitLockController.js'
import { removeEntryToDepo, undoRemoveEntryToDepo } from '../controllers/transferController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// İrsaliye kesmek bayiye borç yazar — RoleSelectPage'deki /cikis kartıyla aynı
// roller. Kapı yokken herhangi bir authenticated token finansal kayıt üretebiliyordu.
router.use(requireAuth)
router.use(requireRole('OPERATOR', 'ADMIN'))

router.post('/', createExit)

// "İrsaliye basıldı" işareti — saha ekranı yazdırmayı tetikledikten SONRA çağırır.
// Sahaya açık olması şart: fişlerin çoğu burada, irsaliye kesilir kesilmez
// basılıyor. Yalnız /admin altında olsaydı rozet asıl kullanımda hiç dolmazdı.
// Bilgi amaçlı; başarısız olursa istemci sessizce geçer (bkz. store/printStore.js).
router.post('/:id/printed', markPrinted)

// Ekran kilidi: aynı pazarı iki operatör aynı anda açmasın (bkz. utils/exitLock.js).
// POST hem alır hem yeniler — ekran 30 sn'de bir aynı yolu çağırıyor.
router.post('/lock/:marketId', acquireLock)
router.delete('/lock/:marketId', releaseLock)

// Çıkış ekranından kalem kaldırma (depoya geri gönderme) + geri alma.
// Depo rotasında değil burada: işlemi yapan operatör, yetki irsaliye kesmekle aynı.
router.post('/remove-entry', removeEntryToDepo)
router.post('/remove-entry/:id/undo', undoRemoveEntryToDepo)
export default router
