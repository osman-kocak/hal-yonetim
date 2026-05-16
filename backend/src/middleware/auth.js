import jwt from 'jsonwebtoken'

export function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Yetkisiz erişim' })
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET)
    next()
  } catch (err) {
    const status = err.name === 'TokenExpiredError' ? 403 : 401
    res.status(status).json({ error: 'Oturum süresi doldu, lütfen tekrar giriş yapın' })
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
