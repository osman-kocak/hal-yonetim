const PRISMA_ERRORS = {
  P2002: 'Bu kayıt zaten mevcut',
  P2025: 'Kayıt bulunamadı',
  P2003: 'İlişkili kayıt bulunamadı',
  P2014: 'Bu kayıt başka kayıtlarla ilişkili, silinemez',
}

export function errorHandler(err, req, res, next) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(err)
  }

  if (err.code && PRISMA_ERRORS[err.code]) {
    return res.status(400).json({ error: PRISMA_ERRORS[err.code] })
  }

  const status = err.status ?? 500
  const message = err.message ?? 'Sunucu hatası oluştu'
  res.status(status).json({ error: message })
}
