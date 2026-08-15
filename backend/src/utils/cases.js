// Kasa muhasebesinin tek karar noktası.
//
// Sistemde iki kasa bakiyesi var: bölgeye/üreticiye verilen kasa (REGION_*) ve
// bayiye giden kasa (MARKET_*). İkisi de "karşı tarafın üstünde duran, geri
// beklediğimiz kasa" demek. Bu fonksiyon bir kaydın o bakiyeye kaç kasa
// eklediğini söyler — ve iki durumda sıfır der:
//
//   1. disposableCase → siyah/karton, tek kullanımlık kasa. Atılıyor, geri
//      dönmüyor; borç doğurması yanlış olur.
//   2. caseCount yok/0.
//
// BİRİM BURAYA KARIŞMAZ (2026-08-13'te değişti). Önce `unit === 'BUNCH'` da
// sıfır sayılıyordu; sahada bağ ve adet malı da geri dönen kasayla geliyor ve
// o kasalar fiilen sayılıyor. Tek belirleyici siyah kasa işareti: tikliyse
// kilo malı bile sayılmaz, tikli değilse bağ/adet malı da sayılır.
//
// Kasa hareketi yazan HER yer buradan geçmeli. Biri unutulursa bayiye ya da
// bölgeye karşılıksız kasa borcu yazılır ve bakiye sessizce kayar.
export function trackedCases(row) {
  if (!row) return 0
  if (row.disposableCase) return 0
  return row.caseCount ?? 0
}

// Bir irsaliyenin/listenin kasa toplamı. items ExitItem[] ise entry'ye iner.
export function sumTrackedCases(rows, pick = (r) => r) {
  return (rows ?? []).reduce((sum, r) => sum + trackedCases(pick(r)), 0)
}
