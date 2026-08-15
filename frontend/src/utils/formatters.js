export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatWeight(weight) {
  return `${Number(weight).toFixed(2)} kg`
}

// Ürünün satış birimi — YALNIZCA miktar eksenini belirler:
//   CASE  weight = kg · BUNCH weight = bağ · PIECE weight = adet
// Kasa sayımı birimden bağımsızdır (tek belirleyici siyah kasa işareti),
// backend'de utils/cases.js → trackedCases(). bağ ve adet AYRI toplanır;
// aynı kovaya atılırlarsa toplanamaz bir sayı çıkar.
export const CASE = 'CASE'
export const BUNCH = 'BUNCH'
export const PIECE = 'PIECE'

export const isBunch = (unit) => unit === BUNCH
export const isPiece = (unit) => unit === PIECE
// Kilo dışı, sayıyla ölçülen birimler — miktar tam sayı, kilo toplamına girmez.
export const isCountable = (unit) => isBunch(unit) || isPiece(unit)

// Miktar birimi etiketi: kg · bağ · adet
export function unitLabel(unit) {
  if (isBunch(unit)) return 'bağ'
  if (isPiece(unit)) return 'adet'
  return 'kg'
}

// Miktarı birimiyle yaz: "340,00 kg" · "150 bağ" · "80 adet".
// formatWeight'in birime duyarlı hâli — koşulsuz " kg" eklemek bağ/adet
// ürünlerinde yanlış okuma üretiyordu.
export function formatQty(value, unit) {
  const n = Number(value ?? 0)
  return isCountable(unit) ? `${n} ${unitLabel(unit)}` : `${n.toFixed(2)} kg`
}

// Bir listenin üç ayrı miktar toplamı — her ekranda aynı üç kova gerekiyor.
// Tek yerde, çünkü biri unutulursa o birim sessizce toplamlardan düşer.
export function sumQty(rows, pick = (r) => r) {
  const total = { weight: 0, bunches: 0, pieces: 0 }
  for (const row of rows ?? []) {
    const r = pick(row)
    if (!r) continue
    const qty = Number(r.weight ?? 0)
    if (isBunch(r.unit)) total.bunches += qty
    else if (isPiece(r.unit)) total.pieces += qty
    else total.weight += qty
  }
  return total
}

// Alan etiketleri — form ve tablo başlıklarında tek kaynak
export function qtyLabel(unit) {
  if (isBunch(unit)) return 'Bağ'
  if (isPiece(unit)) return 'Adet'
  return 'Kilo (kg)'
}
export function priceLabel(unit) {
  return `₺/${unitLabel(unit)}`
}

// Fiyat arama — backend utils/prices.js → priceOf() ile AYNI mantık, ikisi
// birlikte değişmeli. Map iki katman taşır:
//   "12"   → ürünün GENEL fiyatı (yeni standart, Price.qualityId null)
//   "12_3" → eski kaliteli fiyat (kalite 2026-08-13'te kullanımdan kalktı)
// Bulunamazsa null döner — 0 DÖNMEZ: sıfır "bedava", null "fiyat girilmemiş".
export function priceOf(priceMap, productId, qualityId) {
  if (!priceMap || productId == null) return null
  if (qualityId != null) {
    const exact = priceMap[`${productId}_${qualityId}`]
    if (exact != null) return exact
  }
  return priceMap[String(productId)] ?? null
}

export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
