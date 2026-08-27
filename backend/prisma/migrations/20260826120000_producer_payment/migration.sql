-- ÜRETİCİ ÖDEME PANELİ — alış fiyatı + otomatik üretici borcu
--
-- ELLE YAZILDI (prisma migrate dev DEĞİL). Sebep: bu repoda migrate dev P3006
-- veriyor çünkü klasör isimleri kronolojik sırada değil — 20260516142252_
-- entry_session_nullable alfabetik olarak 20260516143208_init'ten ÖNCE geliyor
-- ve shadow DB replay'i "relation Entry does not exist" ile patlıyor. Gövde
-- yine de `prisma migrate diff` ile üretildi (init önce, kalanı alfabetik
-- uygulanmış geçici bir shadow DB'ye karşı), sonra elle şu üç şey eklendi:
-- CHECK constraint, partial index'ler ve sondaki doğrulama bloğu.
--
-- DİKKAT — diff çıktısından BİLEREK ÇIKARILAN 4 satır: Prisma
--   DROP TABLE "Driver_archive" / "Producer_driver_archive" /
--             "VehicleSession_driver_archive" / "CaseMovement_driver_archive"
-- üretti. Bunlar 20260716120000_region_restructure'ın bıraktığı YEDEK tablolar;
-- schema.prisma'da tanımlı olmadıkları için Prisma fazlalık sanıyor. Driver→
-- Region dönüşümünün canlıdaki tek geri dönüş kaydı onlar — silinmez.
--
-- GERİ ALINABİLİR: her şey eklemeli. Hiçbir mevcut satır silinmiyor veya
-- dönüştürülmüyor; prim kolonu DEFAULT 0 ile geliyor (davranış değişmez), Entry
-- snapshot kolonları ve LedgerEntry.entryId nullable. Geri almak için DROP
-- COLUMN + DROP TABLE + DROP TYPE yeter.
--
-- GERİYE DÖNÜK BORÇ ÜRETİLMEZ: PurchasePrice tablosu boş açılıyor, olmayan
-- fiyattan borç üretmek uydurmaktır. Geçmiş kayıtlar için ayrı, opt-in ve
-- dry-run varsayılanlı script: scripts/backfill-producer-debt.js

-- CreateEnum
CREATE TYPE "PurchasePriceSource" AS ENUM ('GENERAL', 'PRODUCER_PREMIUM', 'PRODUCER_SPECIAL');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'CHECK');

-- AlterTable: mal kabul anındaki alış SNAPSHOT'ı.
-- purchaseQty ayrı kolon çünkü Entry.weight mal kabul sonrası DEĞİŞİYOR (depo
-- transferinde yeniden tartılıyor, kısmî aktarmada bölünüyor) — borç oradan
-- türetilirse fire üreticinin alacağını sessizce düşürür.
ALTER TABLE "Entry" ADD COLUMN     "purchasePricePerKg" DOUBLE PRECISION,
ADD COLUMN     "purchasePriceSource" "PurchasePriceSource",
ADD COLUMN     "purchaseQty" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "entryId" INTEGER,
ADD COLUMN     "paymentMethod" "PaymentMethod";

-- AlterTable: mevcut üreticiler 0 alır → davranış değişmez
ALTER TABLE "Producer" ADD COLUMN     "pricePremiumPct" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PurchasePrice" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "pricePerKg" DOUBLE PRECISION NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,

    CONSTRAINT "PurchasePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProducerPrice" (
    "id" SERIAL NOT NULL,
    "producerId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "pricePerKg" DOUBLE PRECISION NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,

    CONSTRAINT "ProducerPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchasePrice_date_productId_idx" ON "PurchasePrice"("date", "productId");

-- CreateIndex: nullable kolon YOK → GERÇEK unique. Price'taki qualityId IS NULL
-- partial index tuzağı (bkz. 20260813190000_price_quality_optional) burada
-- oluşmuyor, bu yüzden prisma.upsert de sorunsuz çalışır.
CREATE UNIQUE INDEX "PurchasePrice_productId_date_key" ON "PurchasePrice"("productId", "date");

-- CreateIndex
CREATE INDEX "ProducerPrice_producerId_productId_date_idx" ON "ProducerPrice"("producerId", "productId", "date");

-- CreateIndex
CREATE INDEX "ProducerPrice_date_producerId_idx" ON "ProducerPrice"("date", "producerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProducerPrice_producerId_productId_date_key" ON "ProducerPrice"("producerId", "productId", "date");

-- CreateIndex: bir mal kabul satırı en fazla BİR borç doğurur. Offline retry'ın
-- ikinci savunma hattı — SyncedBatch aşılsa bile çift borç fiziksel olarak
-- imkânsız.
CREATE UNIQUE INDEX "LedgerEntry_entryId_key" ON "LedgerEntry"("entryId");

-- AddForeignKey
ALTER TABLE "PurchasePrice" ADD CONSTRAINT "PurchasePrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProducerPrice" ADD CONSTRAINT "ProducerPrice_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProducerPrice" ADD CONSTRAINT "ProducerPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Cascade — giriş silinirse borç da düşer, yoksa üreticinin cari
-- hesabında karşılığı olmayan bir borç kalır.
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ——— Buradan aşağısı elle eklendi (Prisma üretmez) ———

-- paymentMethod yalnızca ödeme tiplerinde dolabilsin. Uygulama katmanı da
-- doğruluyor; bu, API dışı yazımlara (psql, script) karşı son savunma.
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_paymentMethod_type_check"
  CHECK ("paymentMethod" IS NULL OR "type" IN ('PRODUCER_PAYMENT', 'MARKET_PAYMENT'));

-- Otomatik borç sorguları (üretici paneli, mutabakat script'i). PARTIAL:
-- satırların çoğunda entryId NULL, tam index boşuna şişerdi.
CREATE INDEX "LedgerEntry_auto_producer_idx" ON "LedgerEntry"("producerId", "occurredAt")
  WHERE "entryId" IS NOT NULL;

-- "Fiyatsız mal kabul" uyarı listesi. PARTIAL: normalde fiyat GİRİLMİŞ olmalı,
-- bu koşulu sağlayan satırlar azınlık.
CREATE INDEX "Entry_missing_purchase_price_idx" ON "Entry"("createdAt")
  WHERE "purchasePricePerKg" IS NULL AND "producerId" IS NOT NULL;

-- DOĞRULAMA — analize güvenme, RUNTIME'da kontrol et
-- (20260716120000_region_restructure'daki DO $$ deseni). Postgres'te DDL
-- transactional: buradan EXCEPTION çıkarsa migration'ın TAMAMI geri alınır ve
-- veritabanı byte-byte aynı kalır.
DO $$
DECLARE
  bad_debt INT;
  arch INT;
BEGIN
  -- Bu migration hiçbir borç üretmiyor; entryId dolu PRODUCER_DEBT olamaz.
  SELECT count(*) INTO bad_debt FROM "LedgerEntry"
   WHERE "type" = 'PRODUCER_DEBT' AND "entryId" IS NOT NULL;
  IF bad_debt > 0 THEN
    RAISE EXCEPTION 'IPTAL: entryId dolu % adet PRODUCER_DEBT var, 0 bekleniyordu', bad_debt;
  END IF;

  -- Driver→Region arşiv tabloları yerinde duruyor mu (bkz. başlıktaki uyarı).
  -- Sıfır ise ya bu DB region_restructure öncesinden ya da arşivler silinmiş —
  -- ikisi de migration'ı durdurmaz, sadece uyarı basar.
  SELECT count(*) INTO arch FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name LIKE '%\_driver\_archive' ESCAPE '\';
  IF arch = 0 THEN
    RAISE NOTICE 'NOT: Driver arsiv tablolari bulunamadi (region_restructure yedegi).';
  END IF;
END $$;
