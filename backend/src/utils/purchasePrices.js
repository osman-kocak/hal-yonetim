// ALIŞ fiyatı çözümleme — TEK KARAR NOKTASI.
//
// Satış tarafındaki utils/prices.js'in eşi ve ondan TAMAMEN BAĞIMSIZ. İş modeli
// alım-satım (tüccarlık): üreticiden malı bir ALIŞ fiyatıyla alıyoruz, bayiye
// bambaşka bir SATIŞ fiyatıyla kesiyoruz, aradaki fark marj. Komisyonculuk
// değil — komisyon/stopaj/rüsum kesintisi YOK.
//
// ÜÇ KATMAN, SIRAYLA. Bu bir FALLBACK ZİNCİRİ, formül DEĞİL — ilk eşleşen kazanır:
//
//   1. PRODUCER_SPECIAL  → üretici+ürün+gün özel fiyatı. Varsa NİHAİDİR.
//   2. PRODUCER_PREMIUM  → genel fiyat × (1 + prim%). Üretici belliyse ve prim ≠ 0.
//   3. GENERAL           → genel alış fiyatı, olduğu gibi.
//
// ÖZEL FİYAT VARSA PRİM UYGULANMAZ — dört gerekçe:
//   a) Prim "genel fiyattan ne kadar saparız" demek; referansı genel fiyattır.
//      Özel fiyat zaten o sapmanın kendisi, üstüne prim eklemek çift sapma yazar.
//   b) Muhasebeci 14,00 girip ekranda 14,70 görürse "sistem fiyatımı değiştiriyor"
//      der ve özel fiyat özelliğini bir daha kullanmaz. Tek seferlik güven kaybı.
//   c) Kayıtta yalnız NİHAİ fiyat snapshot'ı duruyor. Primin uygulanıp
//      uygulanmadığını sonradan geri hesaplamak kuruş yuvarlamasıyla imkânsıza
//      yakın. Nihai kabul edersek belirsizlik hiç doğmuyor.
//   d) Aksi halde 12,00 ödemek isteyen muhasebeci "primim %5, o zaman 11,43
//      gireyim" diye geriye hesap yapmak zorunda kalır. Sahada bu hata demektir.
// purchasePriceSource kolonu "prim uygulanmadı" bilgisini kayıtta kalıcı kılar.
//
// Fiyat okuyan HER yer buradan geçmeli. Biri unutulursa borç sessizce eksik
// yazılır ve üretici parasını alamaz.
//
// ZAMAN BOYUTU burada değil: purchasePriceController.effectivePurchaseRows()'ta
// carry-forward ile çözülür — fiyat yazıldığı güne değil DEĞİŞTİRİLENE KADAR
// geçerlidir, o güne satır yoksa önceki günden devralınır. Buradaki fonksiyonlar
// hazır map üstünde çalışır, hangi günün map'i olduğunu bilmezler.

import { round2 } from './money.js'

export const PURCHASE_GENERAL_KEY = (productId) => String(productId)
export const PURCHASE_SPECIAL_KEY = (producerId, productId) => `${producerId}_${productId}`

// Fiyat bulunamadı. null döner, 0 DÖNMEZ: sıfır "bedava aldık" demek,
// bulunamamak "muhasebeci alış fiyatını henüz girmedi" demek. İkisi karışırsa
// üreticinin parası sessizce buharlaşır. (utils/prices.js:23-24 ile aynı kural.)
const NO_PRICE = Object.freeze({ pricePerKg: null, source: null, premiumPct: null })

// Map İKİ KOVA taşır, tek düz map değil:
//   { general: { "12": 8.5 },  special: { "7_12": 9.2 } }
// Tek kovada birleştirilseydi "7_12" anahtarı utils/prices.js'in QUALITY_KEY'iyle
// biçimsel olarak aynı olurdu; iki farklı anlamı aynı biçime sıkıştırmak tam
// olarak kalite fiyatlarının başına gelen şey (bkz. utils/prices.js:7-10).
export function buildPurchasePriceMap({ general, special } = {}) {
  const map = { general: {}, special: {} }
  for (const r of general ?? []) {
    if (r?.productId == null || r.pricePerKg == null) continue
    map.general[PURCHASE_GENERAL_KEY(r.productId)] = r.pricePerKg
  }
  for (const r of special ?? []) {
    if (r?.producerId == null || r?.productId == null) continue
    // İptal edilmiş özel fiyat YOK sayılır. Satır silinmiyor ki geçmiş bozulmasın
    // ve carry-forward bir önceki tarihli satırı diriltmesin — cancelled bir
    // mezar taşı: bugünden itibaren prim/genel katmanına düşülür.
    if (r.cancelled) continue
    if (r.pricePerKg == null) continue
    map.special[PURCHASE_SPECIAL_KEY(r.producerId, r.productId)] = r.pricePerKg
  }
  return map
}

// Dönen: { pricePerKg, source, premiumPct }
//   pricePerKg null → fiyat yok, BORÇ YAZILMAZ (uyarı listesinde birikir).
//   premiumPct yalnız PRODUCER_PREMIUM'da dolu — kaydın notuna yazılır.
export function purchasePriceOf(map, { productId, producerId = null, premiumPct = 0 } = {}) {
  if (!map || productId == null) return NO_PRICE

  // 1) Özel fiyat — nihai, prim uygulanmaz
  if (producerId != null) {
    const special = map.special?.[PURCHASE_SPECIAL_KEY(producerId, productId)]
    if (special != null) {
      return { pricePerKg: round2(special), source: 'PRODUCER_SPECIAL', premiumPct: null }
    }
  }

  const general = map.general?.[PURCHASE_GENERAL_KEY(productId)]
  if (general == null) return NO_PRICE

  // 2) Prim/iskonto — yalnız üretici belliyse. Üreticisiz girişte primi
  //    uygulanacak bir üretici yok, genel fiyat kalır.
  const pct = Number(premiumPct ?? 0)
  if (producerId != null && Number.isFinite(pct) && pct !== 0) {
    // YUVARLAMA İKİ AŞAMALI ve sıra SABİT: önce BİRİM FİYAT kuruşa yuvarlanır
    // (burada), sonra tutar (round2(price * qty), çağıran tarafta). Muhasebeci
    // ekranda "8,93 TL/kg" görüyor; tutarı 8,9325 üzerinden hesaplarsak elle
    // çarptığında tutmaz ve her seferinde "sizin hesap yanlış" telefonu gelir.
    return { pricePerKg: round2(general * (1 + pct / 100)), source: 'PRODUCER_PREMIUM', premiumPct: pct }
  }

  // 3) Genel fiyat
  return { pricePerKg: round2(general), source: 'GENERAL', premiumPct: null }
}
