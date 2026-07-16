// ŞABLON — gerçek dosya için: cp producers.data.example.js producers.data.js
//
// producers.data.js gerçek üretici isimlerini içerir ve .gitignore'dadır:
// bu repo açık kaynak, gerçek kişilerin adı + bölgesi yayınlanmamalı.
// Deploy'da sorun olmaz — deploy.sh backend/ klasörünü rsync'ler, git'e bakmaz.
//
// Kaynak: üretici listesi Excel'i (2 sütun: üretici ismi, bölge).
// İsimler HAM haliyle (Excel'deki gibi, TÜMÜ BÜYÜK) durur; Türkçe title case
// dönüşümü import sırasında yapılır (bkz. src/utils/turkish.js).

// ⚠ Bu bir BÖLGE DEĞİL. Excel'de bu değeri taşıyan üretici her bölgenin
// listesinde görünür (allRegions = true). Değeri Excel'deki HAM haliyle yazın —
// çift boşluk/yazım hatası dahil; normalizasyon import'ta yapılır.
export const ALL_REGIONS_MARKER_RAW = 'HEPSİNDE  YAZSSIN'

// Fail-fast tripwire'ları — import tek satır yazmadan önce doğrular.
// Gerçek dosyada Excel'deki sayılarla eşleşmeli.
export const EXPECTED_PRODUCER_COUNT = 4
export const EXPECTED_REGION_COUNT = 2

export const PRODUCERS = [
  { name: 'AHMET YILMAZ', region: 'GÜZELYURT' },
  { name: 'FATMA DEMİR', region: 'GÜZELYURT' },
  { name: 'İSMAİL ÇOBANOĞLU', region: 'MESARYA' },
  { name: 'ÖRNEK TÜCCAR', region: 'HEPSİNDE  YAZSSIN' },
]
