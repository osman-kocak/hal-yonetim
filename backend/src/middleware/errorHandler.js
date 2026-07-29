const PRISMA_ERRORS = {
  P2002: 'Bu kayıt zaten mevcut',
  P2025: 'Kayıt bulunamadı',
  P2003: 'İlişkili kayıt bulunamadı',
  P2014: 'Bu kayıt başka kayıtlarla ilişkili, silinemez',
}

export function errorHandler(err, req, res, next) {
  // Production'da da logla. Eskiden burada susuluyordu — pm2 error log'unun
  // boş olmasının sebebi buydu, canlıda hata ayıklamak imkânsızdı.
  console.error(`[${req.method} ${req.originalUrl}]`, err)

  if (err.code && PRISMA_ERRORS[err.code]) {
    return res.status(400).json({ error: PRISMA_ERRORS[err.code] })
  }

  // err.status'ü olan hatalar bizim kasıtlı fırlattıklarımız; mesajları zaten
  // kullanıcıya gösterilmek için yazıldı. Gerisi beklenmeyen hata — ham
  // err.message Prisma sorgu/şema detayı sızdırır, generic mesaj dön.
  if (err.status) {
    return res.status(err.status).json({ error: err.message })
  }
  res.status(500).json({ error: 'Sunucu hatası oluştu' })
}
