// Tarih yardımcıları.
//
// Sunucu Europe/Istanbul (UTC+3). Price.date ise Prisma'da @db.Date — yani UTC
// gün başında saklanıyor. Bu ikisi karıştırıldığı için gün kayması oluyordu:
//
//   new Date(y, m-1, d)        → TR gece yarısı = UTC 21:00, ÖNCEKİ gün
//   new Date()  saat 01:00'de  → UTC 22:00,                 ÖNCEKİ gün
//
// Sonuç: 21 Temmuz raporu 20 Temmuz fiyatlarıyla ciro hesaplıyordu.
// Doğru yol, yerel takvim gününü metin olarak alıp niyete göre çevirmek.

export function localDateString(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateParts(input) {
  const s = typeof input === 'string' ? input.slice(0, 10) : localDateString(input)
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return { y, m, d, s }
}

// Price.date (@db.Date) ile karşılaştırılabilir UTC gün başı.
// Geçersiz girdide null döner — çağıran 400 dönebilsin diye.
export function toPriceDate(input = new Date()) {
  const p = dateParts(input)
  if (!p) return null
  return new Date(`${p.s}T00:00:00.000Z`)
}

// createdAt/occurredAt (timestamp) filtreleri için yerel gün sınırları
export function startOfLocalDay(input = new Date()) {
  const p = dateParts(input)
  if (!p) return null
  return new Date(p.y, p.m - 1, p.d, 0, 0, 0, 0)
}

export function endOfLocalDay(input = new Date()) {
  const p = dateParts(input)
  if (!p) return null
  return new Date(p.y, p.m - 1, p.d, 23, 59, 59, 999)
}
