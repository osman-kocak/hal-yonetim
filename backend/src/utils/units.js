// Ürün satış birimi. Birim YALNIZCA miktar eksenini belirler:
//
//   CASE  → weight = tartılan kilo.  Fatura ₺/kg   üzerinden.
//   BUNCH → weight = bağ sayısı.     Fatura ₺/bağ  üzerinden.
//   PIECE → weight = adet sayısı.    Fatura ₺/adet üzerinden.
//
// Fatura formülü üç birimde de `pricePerKg * weight` olduğu için irsaliye ve
// cari hesap kodu birime bakmaz — BUNCH'ta pricePerKg ₺/bağ, PIECE'te ₺/adet
// demektir. Fark yalnızca miktar ekseninde (FIFO, stok, toplamlar) ve etiketlerde.
//
// KASA BURAYA GİRMEZ: kasa sayımı birimden bağımsızdır, tek belirleyici
// Entry.disposableCase — bkz. utils/cases.js → trackedCases().
//
// bağ ve adet AYRI toplanır. Aynı kovaya atılırlarsa "230 bağ/adet" gibi
// toplanamaz bir sayı çıkar; muhasebe ikisini ayrı görmek zorunda.

export const CASE = 'CASE'
export const BUNCH = 'BUNCH'
export const PIECE = 'PIECE'

export const UNITS = [CASE, BUNCH, PIECE]

// Kilo dışı, sayıyla ölçülen birimler. Miktarı tam sayı, kilo toplamına girmez.
export function isCountable(unit) {
  return unit === BUNCH || unit === PIECE
}

export function isBunch(unit) {
  return unit === BUNCH
}

export function isPiece(unit) {
  return unit === PIECE
}

// Gövdeden gelen birim değerini güvene al. Bilinmeyen değer sessizce CASE'e
// düşerse bağ ürünü kilo modunda işlenir; o yüzden fallback açıkça veriliyor.
export function normalizeUnit(value, fallback = CASE) {
  return UNITS.includes(value) ? value : fallback
}

// Kaydın miktar ekseni: kiloda tartı, bağda bağ adedi, adette adet. Üçü de
// weight kolonunda duruyor — bu fonksiyon o gerçeği tek yerde saklıyor.
export function qtyOf(row) {
  return row?.weight ?? 0
}

// Kullanıcıya gösterilecek miktar birimi etiketi.
export function unitLabel(unit) {
  if (isBunch(unit)) return 'bağ'
  if (isPiece(unit)) return 'adet'
  return 'kg'
}

// Miktarı birimiyle yaz: "340.00 kg" · "150 bağ" · "80 adet".
export function formatQty(value, unit) {
  const n = Number(value ?? 0)
  return isCountable(unit) ? `${n} ${unitLabel(unit)}` : `${n.toFixed(2)} kg`
}

// Bir listenin üç ayrı miktar toplamı. Tek yerde çünkü her ekranda aynı üç
// kova gerekiyor ve biri unutulursa o birim sessizce raporlardan düşer.
export function sumQty(rows, pick = (r) => r) {
  const total = { weight: 0, bunches: 0, pieces: 0 }
  for (const row of rows ?? []) {
    const r = pick(row)
    if (!r) continue
    const qty = qtyOf(r)
    if (isBunch(r.unit)) total.bunches += qty
    else if (isPiece(r.unit)) total.pieces += qty
    else total.weight += qty
  }
  return total
}
