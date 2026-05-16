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
export function requireRole(...allowed) {
  const set = new Set(allowed.map((r) => r.toUpperCase()))
  return (req, res, next) => {
    const role = req.user?.role
    if (!role || !set.has(String(role).toUpperCase())) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' })
    }
    next()
  }
}
