import { prisma } from './prismaClient.js'

// Hassas veri erişimini kaydeder. Fire-and-forget: isteği bekletmez, hata olursa
// yutar (denetim kaydı yazılamadı diye kullanıcının işlemi düşmemeli). Sızıntı
// sonrası "kim ne çekti" sorusunun cevabı burada.
export function audit(req, { action, resource, recordCount = null }) {
  const u = req.user
  prisma.auditLog.create({
    data: {
      userId: u?.id ?? null,
      username: u?.username ?? u?.name ?? null,
      action,
      resource,
      recordCount,
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
    },
  }).catch((err) => {
    // Loglama başarısızlığı sessiz kalmamalı ama isteği de bozmamalı
    console.error('[audit] kayıt yazılamadı:', err.message)
  })
}
