import { prisma } from './prismaClient.js'

// Çıkış ekranı kilidinin tek karar noktası.
//
// Kilit "tavsiye" değil: hem ekran açılışında (acquire) hem irsaliye kesilirken
// (assertHolder) kontrol ediliyor. Yalnızca ekranda kontrol edilse, kilidi
// olmayan bir istemci API'ye doğrudan POST atıp aynı çakışmayı üretebilirdi.

// Bu süre boyunca yenilenmeyen kilit devralınabilir. Ekran 30 sn'de bir
// yeniliyor → 2 dakika, dört kaçırılmış heartbeat demek. Daha kısa tutmak
// tünelde/zayıf sinyalde çalışan operatörün kilidini elinden alırdı; daha uzun
// tutmak pili biten iPad yüzünden pazarı gereksiz bekletirdi.
export const LOCK_TTL_MS = 2 * 60 * 1000

// ADMIN kilit tanımaz: sahada iPad kilitli kalırsa ya da bir hesap sıkışırsa
// yönetici müdahale edebilmeli.
const BYPASS_ROLES = new Set(['ADMIN'])

// Multi-role: user.roles array veya geriye-uyum için user.role string
// (middleware/auth.js → requireRole ile aynı okuma).
export function canBypassLock(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : (user?.role ? [user.role] : [])
  return roles.some((r) => BYPASS_ROLES.has(String(r).toUpperCase()))
}

const staleBefore = () => new Date(Date.now() - LOCK_TTL_MS)

// Kilidi al ya da yenile.
//
// ATOMİK: önce koşullu updateMany (yalnızca kilit bizimse VEYA bayatsa günceller),
// sonra kayıt yoksa create. "Önce oku, sonra yaz" yapılsaydı iki istemci aynı anda
// "boş" görüp ikisi de kilidi kendine yazardı.
//
// Dönüş: { ok: true } | { ok: false, lockedBy, since }
export async function acquireExitLock(marketId, user) {
  const now = new Date()
  const updated = await prisma.exitLock.updateMany({
    where: {
      marketId,
      OR: [
        { userId: user?.id ?? null },          // zaten bizde → yenile
        { heartbeatAt: { lt: staleBefore() } }, // sahibi sessiz → devral
      ],
    },
    data: { userId: user?.id ?? null, username: user?.username ?? user?.name ?? null, heartbeatAt: now },
  })
  if (updated.count > 0) return { ok: true }

  // Satır hiç yoksa oluştur. Yarışta kaybeden taraf P2002 alır ve aşağıdaki
  // okumaya düşer — kilit gerçekten başkasındadır.
  try {
    await prisma.exitLock.create({
      data: {
        marketId,
        userId: user?.id ?? null,
        username: user?.username ?? user?.name ?? null,
        acquiredAt: now,
        heartbeatAt: now,
      },
    })
    return { ok: true }
  } catch (err) {
    if (err?.code !== 'P2002') throw err
  }

  const current = await prisma.exitLock.findUnique({ where: { marketId } })
  // create ile okuma arasında kilit düşmüş olabilir — çağıran tekrar denesin.
  if (!current) return { ok: false, lockedBy: null, since: null }
  return { ok: false, lockedBy: current.username, since: current.acquiredAt }
}

// Koşulsuz devralma — yalnızca ADMIN için (bkz. canBypassLock). Kilit kaydı
// admin'in adına geçer, böylece ekranı açık tutan operatör de bir sonraki
// yenilemede "başkası çalışıyor" uyarısını görür ve iki kişi habersiz aynı
// pazarda kalmaz.
export async function forceAcquireExitLock(marketId, user) {
  const now = new Date()
  const data = {
    userId: user?.id ?? null,
    username: user?.username ?? user?.name ?? null,
    heartbeatAt: now,
    acquiredAt: now,
  }
  await prisma.exitLock.upsert({
    where: { marketId },
    update: data,
    create: { marketId, ...data },
  })
}

// Kilit bizde mi? İrsaliye kesme/kalem taşıma gibi yazma işlemlerinden önce.
// Kilit hiç yoksa da geçerli sayılır: kilit mekanizması ekran deneyimini
// düzeltmek için var, mevcut akışları kilitlemek için değil (ör. kilidi
// bilmeyen eski bir istemci ya da doğrudan API kullanımı).
export async function assertExitLock(marketId, user) {
  if (canBypassLock(user)) return null
  const lock = await prisma.exitLock.findUnique({ where: { marketId } })
  if (!lock) return null
  if (lock.userId === (user?.id ?? null)) return null
  if (lock.heartbeatAt < staleBefore()) return null
  return `Bu pazarda şu an ${lock.username ?? 'başka bir kullanıcı'} çalışıyor`
}

// Ekrandan çıkarken. Yalnızca kilidi TUTAN kullanıcı bırakabilir — yoksa geç
// gelen bir "bırak" isteği, o arada kilidi devralmış kişinin kilidini silerdi.
export async function releaseExitLock(marketId, user) {
  await prisma.exitLock.deleteMany({
    where: { marketId, userId: user?.id ?? null },
  })
}
