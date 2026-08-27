-- KASA DARASI — Entry.grossWeight + Entry.tareKg
--
-- SORUN: mal dolu kasasıyla tartılıyor. Operatörün yazdığı kilo BRÜT, yani
-- içinde plastik kasaların ağırlığı da var. Bu rakam olduğu gibi kaydedilince
-- üreticiye kasa ağırlığı kadar FAZLA ödeniyor ve bayiye kasa ağırlığı kadar
-- FAZLA fatura kesiliyor — aynı hata iki tarafta birden para kaybettiriyor.
--
-- ÇÖZÜM: kayda NET yazılır (weight = brüt − kasa adedi × 2 kg), brüt ve
-- düşülen dara iz olarak ayrı kolonlarda durur.
--
-- NEDEN NET'İ weight'E YAZIYORUZ: fiyat, üretici borcu, bayi faturası, teslim
-- fişi, depo stoku ve raporların TAMAMI weight kolonunu okuyor. Net'i buraya
-- yazmak hepsini tek hamlede doğru kılıyor. Brütü bırakıp her hesapta ayrı
-- ayrı düşmek seçilmedi: on beşten fazla çağrı yeri var ve biri unutulsa
-- fatura sessizce yanlış tutardan kesilirdi (aynı gerekçe utils/tare.js'te).
--
-- UYGULAMA KOŞULU (utils/tare.js → tareApplies): yalnız CASE birimli üründe ve
-- yalnız NORMAL kasada. Bağ/adette weight kolonu SAYI tutuyor, oradan kilo
-- düşmek anlamsız; siyah/karton kasa (disposableCase) ise malla birlikte
-- gidiyor ve tartıda karşılığı yok.
--
-- NULLABLE ve EKLEMELİ: MEVCUT SATIRLAR ELLENMEZ. Geçmiş kayıtların weight'i
-- brüt kalır ve NULL bunu söyler ("bu satıra dara uygulanmadı"). Geriye dönük
-- düzeltme BİLEREK YAPILMIYOR: o kayıtların bir kısmı faturalanmış, bir kısmı
-- ödenmiş; kilolarını sonradan oynatmak kesilmiş irsaliyelerle cari hesabı
-- birbirinden ayırırdı.
--
-- tareKg SNAPSHOT'tır: dara oranı sonradan değişse de bu satırın hesabı sabit
-- kalır (purchasePricePerKg ile aynı desen).
--
-- Geri alma: DROP COLUMN. weight'te duran net'ler brüte DÖNMEZ — kolonları
-- düşürmek yalnız izi siler, hesabı geri almaz.

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "grossWeight" DOUBLE PRECISION,
ADD COLUMN     "tareKg" DOUBLE PRECISION;

-- Kolonlar dolu gelirse migration yanlış veritabanında çalışıyor demektir.
DO $$
DECLARE bad INT;
BEGIN
  SELECT COUNT(*) INTO bad FROM "Entry" WHERE "grossWeight" IS NOT NULL OR "tareKg" IS NOT NULL;
  IF bad > 0 THEN
    RAISE EXCEPTION 'Beklenmeyen durum: % satırda dara kolonu zaten dolu', bad;
  END IF;
END $$;
