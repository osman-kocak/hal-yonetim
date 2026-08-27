// ALIŞ TAKİBİNİN BAŞLANGIÇ ANI.
//
// Üretici borcu 2026-08-26'da devreye girdi. Ondan ÖNCEKİ mal kabullerin
// purchasePricePerKg'si NULL ve borçları yok — bilinçli bir karar: o günlerin
// alış fiyatı sistemde hiç olmadı, olmayan fiyattan borç üretmek uydurmaktır
// ve muhasebe zaten o dönemi elle kapattı.
//
// SORUN ŞU: "fiyatsız mal kabul" uyarısı ham koşula (purchasePricePerKg IS NULL)
// baksaydı geçmişteki YÜZLERCE kaydı listeler, panel açılır açılmaz kırmızı
// uyarı basar ve muhasebeci "borcum eksik" sanardı. Uyarı gerçek bir eksikliği
// göstermeli, tarihsel bir gerçeği değil.
//
// Bu yüzden fiyatsız/uyarı sorguları bu tarihten İTİBAREN bakıyor. Borç YAZMA
// mantığı bundan etkilenmez — o zaten yalnız yeni kayıtlarda çalışıyor.
//
// HAL_PURCHASE_TRACKING_START tanımsızsa null döner ve filtre uygulanmaz
// (geliştirme/test ortamı: her şey görünsün).

let cached
let cachedRaw

export function purchaseTrackingStart() {
  const raw = process.env.HAL_PURCHASE_TRACKING_START
  if (raw === cachedRaw) return cached
  cachedRaw = raw
  if (!raw) { cached = null; return cached }
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) {
    console.warn(`[purchaseTracking] HAL_PURCHASE_TRACKING_START geçersiz: "${raw}" — filtre uygulanmayacak`)
    cached = null
    return cached
  }
  cached = d
  return cached
}

// Prisma where parçası: { createdAt: { gte: ... } } ya da boş nesne.
// Çağıran spread ediyor, tarih yoksa hiçbir kısıt eklenmiyor.
export function trackingRange(field = 'createdAt') {
  const start = purchaseTrackingStart()
  return start ? { [field]: { gte: start } } : {}
}

// Var olan bir aralık nesnesine alt sınır ekler — kullanıcının seçtiği dateFrom
// takip başlangıcından ESKİYSE, başlangıç kazanır. Aksi halde tarih filtresini
// geriye çekmek uyarı listesine geçmişi geri getirirdi.
export function clampToTracking(range, field = 'createdAt') {
  const start = purchaseTrackingStart()
  if (!start) return range
  const mevcut = range?.[field]
  if (!mevcut) return { ...range, [field]: { gte: start } }
  const gte = mevcut.gte && new Date(mevcut.gte) > start ? mevcut.gte : start
  return { ...range, [field]: { ...mevcut, gte } }
}
