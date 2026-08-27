// Para yuvarlaması — TEK KARAR NOKTASI.
//
// Math.round(x * 100) / 100 deseni kod tabanında sekiz ayrı yere kopyalanmıştı
// (ledgerController, exitController, transferController, marketSummary...).
// Biri unutulduğunda fişte "18.499,999999" basıyor — Float aritmetiğinin
// kaçınılmaz sonucu, hata değil. Yeni para yazan her yer buradan geçer.
//
// NOT (bilinçli borç): amount/pricePerKg/weight kolonları Float. Prisma Decimal'e
// geçmek doğru olurdu ama her controller'ı ve tüm frontend'i etkiler; ayrı iş.
// O güne kadar disiplin şu: toplama/çarpma serbest, EKRANA veya DB'ye giden her
// tutar son adımda round2'den geçer.

export function round2(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

// Satır toplamı. Ara toplamlar yuvarlanmaz, yalnız sonuç yuvarlanır: her satırı
// tek tek yuvarlayıp toplamak kuruş kaymalarını biriktirir.
export function sumMoney(rows, pick = (r) => r) {
  return round2((rows ?? []).reduce((s, r) => s + (Number(pick(r)) || 0), 0))
}
