// Rol bazlı ağ kısıtı.
//
// Saha rolleri (DEPO, OPERATOR, CASE_MANAGER) yalnızca hal'in statik hattından
// çalışabilir; ADMIN ve ACCOUNTING her yerden girebilir. Sebep: depo/pazar/fiyat
// verisi hal dışına taşınmasın — çalınan ya da ödünç verilen bir saha hesabı
// dışarıdan hiçbir veri çekemesin.
//
// Bu kısıt web sunucusunda (OpenLiteSpeed accessControl) yapılamaz: o katman
// login'den ÖNCE çalışır, isteğin hangi role ait olduğunu bilmez. Bu yüzden
// kontrol requireAuth'un içine, yani JWT çözüldükten sonraya konuldu.

const REMOTE_ANYWHERE_ROLES = new Set(['ADMIN', 'ACCOUNTING'])

export const NETWORK_DENIED_MESSAGE =
  'Bu hesap yalnızca hal içindeki ağdan kullanılabilir'

// Env değişimini (test, --watch restart) yakalayabilmek için lazy parse.
let cachedRaw = null
let cachedSet = new Set()

function allowedIps() {
  const raw = process.env.HAL_ALLOWED_IPS ?? ''
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedSet = new Set(
      raw.split(',').map((s) => normalizeIp(s)).filter(Boolean)
    )
  }
  return cachedSet
}

// Express IPv4-mapped IPv6 döndürebilir (::ffff:5.104.13.98) ve loopback
// bağlantılarda ::1 gelir. Karşılaştırma öncesi düz IPv4'e indir.
export function normalizeIp(ip) {
  const bare = String(ip ?? '').trim()
  if (bare === '::1') return '127.0.0.1'
  return bare.startsWith('::ffff:') ? bare.slice(7) : bare
}

// Multi-role: user.roles array veya geriye-uyum için user.role string
function rolesOf(user) {
  if (Array.isArray(user?.roles)) return user.roles
  return user?.role ? [user.role] : []
}

export function networkAllows(user, ip) {
  const roles = rolesOf(user).map((r) => String(r).toUpperCase())
  if (roles.some((r) => REMOTE_ANYWHERE_ROLES.has(r))) return true
  // Allowlist boşsa kısıt yapılandırılmamış demektir (dev). Prod'da bu durum
  // assertNetworkPolicy() ile boot'ta engelleniyor.
  if (allowedIps().size === 0) return true
  return allowedIps().has(normalizeIp(ip))
}

// Prod'da HAL_ALLOWED_IPS unutulursa saha hesapları sessizce her yerden
// erişilebilir hale gelir. Sessiz güvenlik açığı yerine boot'ta patla.
export function assertNetworkPolicy() {
  if (allowedIps().size === 0) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        'FATAL: HAL_ALLOWED_IPS tanımlanmamış — saha rolleri için ağ kısıtı uygulanamaz'
      )
      process.exit(1)
    }
    console.warn(
      'UYARI: HAL_ALLOWED_IPS boş — saha rolleri her IP\'den erişebilir (dev modu)'
    )
  }
}
