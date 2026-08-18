import { prisma } from './prismaClient.js'

// Denetim kaydı. Fire-and-forget: isteği bekletmez, hata olursa yutar (log
// yazılamadı diye kullanıcının işlemi düşmemeli). "Kim, ne zaman, neyi" sorusunun
// cevabı burada.
//
// 2026-08-18: yazma eylemleri eklendi. Önceden yalnızca READ/EXPORT kaydediliyordu
// ve logda sadece admin panelini gezenler görünüyordu — sahadaki operatörlerin
// yaptığı mal kabul, irsaliye, iade hiç iz bırakmıyordu.
export function audit(req, { action, resource, recordCount = null, recordId = null, detail = null }) {
  const u = req.user
  prisma.auditLog.create({
    data: {
      userId: u?.id ?? null,
      username: u?.username ?? u?.name ?? null,
      action,
      resource,
      recordCount,
      recordId,
      // Uzun metin logu şişirmesin; özet zaten kısa olmalı.
      detail: detail ? String(detail).slice(0, 300) : null,
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
    },
  }).catch((err) => {
    // Loglama başarısızlığı sessiz kalmamalı ama isteği de bozmamalı
    console.error('[audit] kayıt yazılamadı:', err.message)
  })
}

// Yazma eylemleri için kısayollar — çağrı yerleri tek satır kalsın diye.
export const auditCreate = (req, resource, recordId, detail, recordCount = null) =>
  audit(req, { action: 'CREATE', resource, recordId, detail, recordCount })

export const auditUpdate = (req, resource, recordId, detail) =>
  audit(req, { action: 'UPDATE', resource, recordId, detail })

export const auditDelete = (req, resource, recordId, detail) =>
  audit(req, { action: 'DELETE', resource, recordId, detail })

// Giriş denemeleri. Başarısız denemeler de yazılıyor: çalınan/denenen hesabı
// ancak böyle fark ederiz. Parola ASLA loglanmaz, yalnızca denenen kullanıcı adı.
//
// req.user henüz yok (giriş sırasında token oluşmadı), o yüzden kullanıcı bilgisi
// parametreyle geliyor.
export function auditLogin(req, { ok, username, userId = null }) {
  prisma.auditLog.create({
    data: {
      userId,
      username: username ? String(username).slice(0, 100) : null,
      action: ok ? 'LOGIN' : 'LOGIN_FAIL',
      resource: 'auth',
      detail: ok ? 'Giriş yapıldı' : 'Hatalı kullanıcı adı veya parola',
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
    },
  }).catch((err) => {
    console.error('[audit] giriş kaydı yazılamadı:', err.message)
  })
}

// Saklama süresi. Denetim kaydı sınırsız birikmemeli, ama sızıntı incelemesi
// genelde haftalar sonra başlıyor — 30 gün bilinçli seçim (7 gün istenmişti,
// inceleme penceresi için kısa bulundu).
export const AUDIT_RETENTION_DAYS = 30

// Eski kayıtları sil. server.js günde bir çağırıyor.
export async function purgeOldAuditLogs() {
  const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const { count } = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } })
  if (count > 0) console.log(`[audit] ${count} eski kayıt silindi (>${AUDIT_RETENTION_DAYS} gün)`)
  return count
}
