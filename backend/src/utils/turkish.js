// Türkçe metin normalizasyonu — seed.js ve import-producers.js ortak kullanır.
//
// Bu fonksiyonlar üretici/bölge kayıtlarının idempotans anahtarını üretir:
// import her çalıştığında aynı Excel satırı aynı stringe dönüşmeli, yoksa
// "idempotent" import sessizce mükerrer satır yaratır.

// NFC + boşluk normalizasyonu.
// NFC ŞART: Excel "İ"yi U+0130 (tek kod noktası) ya da "I"+U+0307 (NFD, iki kod noktası)
// olarak verebilir — ekranda aynı görünür ama Postgres için farklı satırdır.
export const normalizeTr = (s) => String(s).normalize('NFC').replace(/\s+/g, ' ').trim()

// Türkçe başlık biçimi: her kelimenin ilk harfi büyük, gerisi küçük (İ/I/ı doğru).
// "AHMET YILMAZ" → "Ahmet Yılmaz", "İSMAİL ÇOBANOĞLU" → "İsmail Çobanoğlu"
//
// Bilinen sınır: ASCII yazılmış girdi ("ISMAIL") Türkçe kurallarına göre "Ismaıl" olur.
// Fonksiyon doğru, girdi yanlış — sözlük olmadan çözülemez. Bu yüzden import script'i
// kaydedeceği her ismi yazdırır; dry-run'da insan okur.
export const titleCaseTr = (s) =>
  normalizeTr(s)
    .toLocaleLowerCase('tr')
    .replace(/(^|[\s(.\-/])(\p{L})/gu, (_, sep, ch) => sep + ch.toLocaleUpperCase('tr'))

// Karşılaştırma anahtarı: büyük/küçük, boşluk ve Unicode farklarını yutar.
// "AHMET YILMAZ", "Ahmet  Yılmaz" ve NFD varyantı aynı anahtara düşer.
export const foldTr = (s) => titleCaseTr(s).toLocaleLowerCase('tr')
