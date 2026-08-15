// Fiyat arama — TEK KARAR NOKTASI.
//
// Fiyat map'i iki katman taşır:
//   "12_3" → 12 no'lu ürünün 3 no'lu kalitesinin fiyatı (ESKİ kayıtlar)
//   "12"   → 12 no'lu ürünün GENEL fiyatı (kaliteden bağımsız, YENİ standart)
//
// Kalite özelliği 2026-08-13'te kullanımdan kalktı. Mal kabul ekranı zaten
// qualityId göndermiyordu; kaydın kalitesi null olduğu için "12_null" anahtarı
// üretiliyor ve kaliteli fiyat satırıyla asla eşleşmiyordu — irsaliyede fiyat
// boş kalıyordu. Artık önce tam eşleşme, sonra genel fiyat aranıyor.
//
// Fiyat okuyan HER yer buradan geçmeli: biri unutulursa o ekranda fiyat
// görünmez ve fatura tutarı sessizce eksik hesaplanır.
//
// Map'in ZAMAN boyutu burada değil, priceController.effectivePriceRows()'ta
// çözülür: fiyat yazıldığı güne değil değiştirilene kadar geçerlidir, o güne
// satır yoksa önceki günden devralınır. Buradaki fonksiyonlar hazır map üstünde
// çalışır — hangi günün map'i olduğunu bilmezler.

export const GENERAL_KEY = (productId) => String(productId)
export const QUALITY_KEY = (productId, qualityId) => `${productId}_${qualityId}`

// Kaydın fiyatı. Bulunamazsa null — 0 DÖNMEZ: sıfır "bedava" demek, bulunamamak
// "muhasebeci henüz girmedi" demek. İkisi karışırsa borç sessizce silinir.
export function priceOf(priceMap, productId, qualityId) {
  if (!priceMap || productId == null) return null
  if (qualityId != null) {
    const exact = priceMap[QUALITY_KEY(productId, qualityId)]
    if (exact != null) return exact
  }
  const general = priceMap[GENERAL_KEY(productId)]
  return general ?? null
}

// Price satırlarından map kur. Genel satır (qualityId null) ürün anahtarına,
// kaliteli satır kombinasyon anahtarına yazılır.
export function buildPriceMap(prices) {
  const map = {}
  for (const p of prices ?? []) {
    const key = p.qualityId == null
      ? GENERAL_KEY(p.productId)
      : QUALITY_KEY(p.productId, p.qualityId)
    map[key] = p.pricePerKg
  }
  return map
}
