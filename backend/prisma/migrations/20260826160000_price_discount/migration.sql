-- İNDİRİMLİ SATIŞ FİYATI — normal fiyat + net (uygulanan) fiyat
--
-- İş kuralı: muhasebeci bazen bir ürünü normal fiyatının altında satıyor.
-- Örnek: domates normal 70 TL, o gün net 50 TL'den kesiliyor.
--
-- MEVCUT KOD HİÇ DEĞİŞMEDEN ÇALIŞSIN diye anlam şu şekilde bölündü:
--   Price.pricePerKg      → UYGULANACAK fiyat (indirim varsa indirimli tutar).
--                           İrsaliye, marj ve tüm fiyat okuyan kod bunu kullanır.
--   Price.listPricePerKg  → NORMAL (indirim öncesi) fiyat. NULL = indirim yok.
--                           Yalnız gösterim: fişte "70 → 50" basılır.
-- Ters kurgu (pricePerKg'yi normal yapmak) her fiyat okuyan yeri değiştirmeyi
-- gerektirir ve bir yer unutulursa fatura sessizce yanlış tutardan kesilir.
--
-- ExitItem.listPricePerKg: fiş snapshot'ı. pricePerKg ile aynı gerekçe —
-- fiyat sonradan değişse de basılmış fiş aynı indirimi göstermeli.
--
-- İkisi de NULLABLE ve eklemeli: mevcut 805 Entry / tüm Price satırları
-- etkilenmez, indirim yok sayılır. Geri alma: DROP COLUMN.
--
-- (Gövde `prisma migrate diff` ile üretildi; çıktıdaki DROP TABLE
--  *_driver_archive satırları region_restructure'ın yedekleridir, ALINMADI.)

-- AlterTable
ALTER TABLE "Price" ADD COLUMN     "listPricePerKg" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ExitItem" ADD COLUMN     "listPricePerKg" DOUBLE PRECISION;

-- Normal fiyat, uygulanan fiyattan DÜŞÜK olamaz — öyleyse indirim değil zamdır
-- ve kullanıcı iki kolonu karıştırmıştır. Uygulama katmanı da doğruluyor;
-- bu, API dışı yazımlara (psql, script) karşı son savunma.
ALTER TABLE "Price" ADD CONSTRAINT "Price_listPrice_gte_price_check"
  CHECK ("listPricePerKg" IS NULL OR "listPricePerKg" >= "pricePerKg");

DO $$
DECLARE bad INT;
BEGIN
  SELECT count(*) INTO bad FROM "Price" WHERE "listPricePerKg" IS NOT NULL;
  IF bad > 0 THEN
    RAISE EXCEPTION 'IPTAL: yeni kolon dolu geldi (%), 0 bekleniyordu', bad;
  END IF;
END $$;
