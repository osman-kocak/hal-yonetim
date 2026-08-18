import { prisma } from '../utils/prismaClient.js'
import {
  acquireExitLock, forceAcquireExitLock, releaseExitLock, canBypassLock, LOCK_TTL_MS,
} from '../utils/exitLock.js'

// Çıkış ekranı kilidi uç noktaları.
//
// Alma ve yenileme AYNI çağrı: ekran açılışta bir kez, sonra 30 sn'de bir aynı
// isteği atıyor. Ayrı "heartbeat" yolu olsaydı, kilidi zaman aşımına uğrayıp
// başkasına geçmiş bir ekran yenilemeye devam edip kilidi geri çalabilirdi —
// bu yolda devralma koşulu her seferinde yeniden değerlendiriliyor.
export async function acquireLock(req, res, next) {
  try {
    const marketId = Number(req.params.marketId)
    if (!Number.isInteger(marketId)) {
      return res.status(400).json({ error: 'Geçersiz pazar' })
    }
    const market = await prisma.market.findUnique({
      where: { id: marketId },
      select: { id: true },
    })
    if (!market) return res.status(404).json({ error: 'Pazar bulunamadı' })

    const result = await acquireExitLock(marketId, req.user)
    if (result.ok) return res.json({ ok: true, ttlMs: LOCK_TTL_MS })

    // ADMIN kilidi DEVRALIR: kayıt admin'in adına geçer, böylece ekranı açık
    // tutan operatör bir sonraki yenilemede uyarıyı görür — iki kişi habersiz
    // aynı pazarda kalmaz.
    if (canBypassLock(req.user)) {
      await forceAcquireExitLock(marketId, req.user)
      return res.json({
        ok: true,
        ttlMs: LOCK_TTL_MS,
        overriding: true,
        lockedBy: result.lockedBy,
      })
    }
    return res.status(409).json({
      error: `Bu pazarda şu an ${result.lockedBy ?? 'başka bir kullanıcı'} çalışıyor`,
      lockedBy: result.lockedBy,
      since: result.since,
    })
  } catch (err) { next(err) }
}

// Best-effort: istek gelmezse kilit zaman aşımıyla düşer (bkz. utils/exitLock.js).
export async function releaseLock(req, res, next) {
  try {
    const marketId = Number(req.params.marketId)
    if (!Number.isInteger(marketId)) {
      return res.status(400).json({ error: 'Geçersiz pazar' })
    }
    await releaseExitLock(marketId, req.user)
    res.json({ ok: true })
  } catch (err) { next(err) }
}
