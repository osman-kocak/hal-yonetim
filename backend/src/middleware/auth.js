import jwt from 'jsonwebtoken'
import { networkAllows, NETWORK_DENIED_MESSAGE } from './network.js'

export function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Yetkisiz erişim' })
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET)
    // Ağ kısıtı her istekte kontrol edilir, sadece login'de değil: hal içinde
    // alınan token dışarı çıkarıldığında da çalışmasın.
    if (!networkAllows(req.user, req.ip)) {
      return res
        .status(403)
        .json({ error: NETWORK_DENIED_MESSAGE, code: 'NETWORK_RESTRICTED' })
    }
    next()
  } catch (err) {
    // Süresi dolmuş token da 401 olmalı: "kimliğini yeniden doğrula" demek.
    // 403 dönerse frontend interceptor oturumu temizlemez ve kullanıcı ölü
    // token'la içeride sıkışır. 403 sadece requireRole'a ait (yetki yok).
    const expired = err.name === 'TokenExpiredError'
    res.status(401).json({
      error: expired
        ? 'Oturum süresi doldu, lütfen tekrar giriş yapın'
        : 'Yetkisiz erişim',
    })
  }
}

// Belirli rolleri olan kullanıcıyı zorunlu kıl — requireAuth'tan SONRA kullan
// Multi-role: user.roles array veya geriye-uyum için user.role string
export function requireRole(...allowed) {
  const set = new Set(allowed.map((r) => r.toUpperCase()))
  return (req, res, next) => {
    const u = req.user
    const userRoles = Array.isArray(u?.roles)
      ? u.roles
      : (u?.role ? [u.role] : [])
    const ok = userRoles.some((r) => set.has(String(r).toUpperCase()))
    if (!ok) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' })
    }
    next()
  }
}
