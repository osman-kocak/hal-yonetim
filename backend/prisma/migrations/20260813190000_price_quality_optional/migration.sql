-- Fiyat artık ÜRÜN BAŞINA TEK: Price.qualityId nullable oldu, NULL = genel fiyat.
--
-- NEDEN: kalite özelliği kullanımdan kalktı. Mal kabul ekranı zaten qualityId
-- göndermiyordu (Entry.qualityId null geliyor), fiyat araması ise
-- `productId_qualityId` anahtarıyla yapılıyordu — yani kaliteli fiyat satırları
-- saha girişleriyle hiç eşleşmiyor, irsaliyede fiyat boş kalıyordu.
--
-- Elle yazıldı: bu repoda `prisma migrate dev` çalışmıyor (P3006) —
-- bkz. 20260729180000_audit_log_entry_source.
--
-- VERİ KAYBI YOK: mevcut kaliteli satırlar olduğu gibi kalır ve aranmaya devam
-- eder (önce ürün+kalite, yoksa genel fiyat — utils/prices.js → priceOf).
-- Geçmiş irsaliye tutarları zaten ExitItem.pricePerKg snapshot'ında.

-- AlterTable
ALTER TABLE "Price" ALTER COLUMN "qualityId" DROP NOT NULL;

-- Genel fiyatın tekilliği. Mevcut @@unique(productId, qualityId, date) NULL'lu
-- satırları KAPSAMAZ: Postgres unique kısıtında iki NULL birbirine eşit sayılmaz,
-- yani aynı ürün+gün için sınırsız genel fiyat satırı açılabilirdi ve hangisinin
-- geçerli olduğu sorgu sırasına kalırdı. Partial index bunu kapatıyor.
CREATE UNIQUE INDEX IF NOT EXISTS "Price_productId_date_general_key"
  ON "Price" ("productId", "date")
  WHERE "qualityId" IS NULL;

-- Genel fiyat araması gün + ürün üzerinden gidiyor
CREATE INDEX IF NOT EXISTS "Price_date_productId_idx" ON "Price" ("date", "productId");
