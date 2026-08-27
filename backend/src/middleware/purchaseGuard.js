// ALIŞ FİYATI SIZINTI KORUMASI — fail-closed.
//
// Alış fiyatı (üreticiden malı kaça aldığımız) TİCARİ SIRDIR: saha
// operatörünün, depocunun ve kasacının işi değil. Dışarı çıkarsa hem üreticiyle
// hem bayiyle pazarlık gücü kaybedilir.
//
// SORUN: Entry'ye purchasePricePerKg kolonu eklendiği AN yedi uç onu sızdırır,
// çünkü hepsi `select` değil `include` kullanıyor ve Prisma'da include = tüm
// skaler kolonlar:
//   GET  /api/markets/:id/entries          (OPERATOR, DEPO, ACCOUNTING)
//   GET  /api/markets/:id/removed-entries  (OPERATOR, DEPO)
//   GET  /api/region/:id/entries           (OPERATOR)
//   GET  /api/depo/entries                 (DEPO)
//   POST /api/entry/batch      → yanıt     (OPERATOR)
//   PUT  /api/entry/:id        → yanıt     (OPERATOR)
//   POST /api/exit             → yanıt     (OPERATOR)
//
// NEDEN MIDDLEWARE, controller başına select DEĞİL: tek tek select yazmak bugün
// çalışır, yarın eklenen sekizinci uçta unutulur ve sızıntı SESSİZ olur —
// kimse "operatörün ekranında alış fiyatı var" diye ihbar etmez. Üstelik saha
// tarafı yanıtları IndexedDB'ye cache'liyor (lib/offlineDb.js): bir kez sızarsa
// iPad'in diskine yazılır ve geri alınamaz.
//
// FAIL-CLOSED: bu middleware /admin DIŞINDAKİ tüm router'lara takılı, yani
// varsayılan GİZLE. Yeni bir saha ucu eklendiğinde hiçbir şey yapılmadan
// korunur. /api/admin zaten requireRole('ADMIN','ACCOUNTING') arkasında ve o
// ekranların alış fiyatını GÖRMESİ gerekiyor — oraya takılmıyor.
//
// İkinci kemer olarak marketController/regionController açık select'e çevrildi;
// bu middleware onların da unutulmasına karşı.

const HIDDEN = ['purchasePricePerKg', 'purchasePriceSource', 'purchaseQty']

// Derinlik sınırı: yanıtlar sayfa başına ≤200 satır ve en fazla 3-4 seviye
// iç içe (exit → items → entry → product). 8 fazlasıyla yeter; döngüsel
// referansta sonsuza gitmeyi de engeller.
const MAX_DEPTH = 8

function strip(node, depth = 0) {
  if (node == null || depth > MAX_DEPTH) return node
  if (Array.isArray(node)) {
    for (const n of node) strip(n, depth + 1)
    return node
  }
  if (typeof node !== 'object' || node instanceof Date) return node
  for (const k of HIDDEN) {
    if (k in node) delete node[k]
  }
  for (const v of Object.values(node)) strip(v, depth + 1)
  return node
}

export function hidePurchasePrices(req, res, next) {
  const original = res.json.bind(res)
  res.json = (body) => original(strip(body))
  next()
}
