-- Şoför (Driver) kavramı tamamen kaldırılır, yerine Bölge (Region) gelir.
--
-- ⚠ BU DOSYA ELLE YAZILDI — `prisma migrate dev` ile ÜRETİLMEDİ, üretilemez:
--   1) Prisma'nın rename tespiti yok: VehicleSession→RegionSession için DROP+CREATE,
--      vehicleSessionId→regionSessionId için DROP+ADD COLUMN üretir. Bu tüm oturumları
--      ve entry↔oturum bağlarını SESSİZCE siler. Aşağıda ALTER ... RENAME kullanılıyor.
--   2) Migration klasör sırası bozuk (entry_session_nullable, init'ten önce sıralanıyor)
--      → shadow DB replay P3006 ile patlıyor, migrate dev bu repoda çalışmıyor.
--   3) Postgres enum değeri düşüremez; Prisma'nın üretmeyeceği bir statement sırası gerekiyor.
--
-- Prisma bu dosyayı PostgreSQL'de TEK TRANSACTION içinde çalıştırır ve Postgres'te DDL
-- transactional → ya tamamen uygulanır ya da DB byte-byte aynı kalır. Bölmeyin.

-- ============================================================
-- 0) ARŞİV — silinecek her şeyin yedeği.
--    type::text ŞART: enum kopyalanırsa adım 7'deki DROP TYPE bağımlılıktan patlar.
--    NOT: `prisma db push` bu tabloları düşürür (şemada yoklar). Prod'da db:push/db:reset YASAK.
--    Asıl güvenlik ağı pg_dump; bunlar kolay erişim içindir.
-- ============================================================
CREATE TABLE "Driver_archive" AS
  SELECT "id", "name", "createdAt" FROM "Driver";

CREATE TABLE "CaseMovement_driver_archive" AS
  SELECT "id", "type"::text AS "type", "qty", "marketId", "driverId", "exitId",
         "note", "occurredAt", "createdAt", "createdBy"
  FROM "CaseMovement"
  WHERE "type" IN ('DRIVER_OUT','DRIVER_IN','DRIVER_INIT','DRIVER_ADJUST');

CREATE TABLE "VehicleSession_driver_archive" AS
  SELECT "id", "driverId", "status"::text AS "status", "createdAt" FROM "VehicleSession";

CREATE TABLE "Producer_driver_archive" AS
  SELECT "id", "name", "driverId" FROM "Producer" WHERE "driverId" IS NOT NULL;

-- ============================================================
-- 1) GÜVENLİK KONTROLÜ — DRIVER_* satırları gerçekten saf şoför kaydı mı?
--    Kod analizi bunu gösteriyor (caseMovementController DRIVER tiplerinde marketId:null yazıyor,
--    entryController hiç marketId yazmıyor, exitId sadece MARKET_OUT ile geliyor) — ama
--    migration analize güvenmek yerine RUNTIME'da doğruluyor.
--    Beklenen: 0. Değilse EXCEPTION → transaction geri alınır, hiçbir veri kaybolmaz.
-- ============================================================
DO $$
DECLARE bad INT;
BEGIN
  SELECT count(*) INTO bad FROM "CaseMovement"
   WHERE "type" IN ('DRIVER_OUT','DRIVER_IN','DRIVER_INIT','DRIVER_ADJUST')
     AND ("marketId" IS NOT NULL OR "exitId" IS NOT NULL);
  IF bad > 0 THEN
    RAISE EXCEPTION 'IPTAL: % adet DRIVER_* hareketi marketId/exitId tasiyor; silmek bayi/irsaliye verisini bozardi', bad;
  END IF;

  SELECT count(*) INTO bad FROM "ReturnRecord" r
    JOIN "CaseMovement" c ON c."id" = r."caseMovementId"
   WHERE c."type" IN ('DRIVER_OUT','DRIVER_IN','DRIVER_INIT','DRIVER_ADJUST');
  IF bad > 0 THEN
    RAISE EXCEPTION 'IPTAL: % adet iade kaydi DRIVER_* hareketine bagli', bad;
  END IF;
END $$;

-- ============================================================
-- 2) Region
-- ============================================================
CREATE TABLE "Region" (
    "id"        SERIAL NOT NULL,
    "name"      TEXT NOT NULL,
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Region_name_key" ON "Region"("name");
CREATE INDEX "Region_active_idx" ON "Region"("active");

-- ============================================================
-- 3) VehicleSession → RegionSession
--    RENAME: satırlar korunmalı, Entry FK'si bu id'lere bakıyor.
-- ============================================================
ALTER TABLE "VehicleSession" RENAME TO "RegionSession";
ALTER TABLE "RegionSession" RENAME CONSTRAINT "VehicleSession_pkey" TO "RegionSession_pkey";
ALTER SEQUENCE "VehicleSession_id_seq" RENAME TO "RegionSession_id_seq";

-- driverId anlamsız → DROP+ADD (RENAME DEĞİL). Rename edilseydi ve SET NULL unutulsaydı
-- şoför id 3 sessizce "bölge 3" olurdu — gerçek ama yanlış bir bölge.
-- DROP COLUMN, bağlı FK ve index'i de otomatik düşürür.
ALTER TABLE "RegionSession" DROP COLUMN "driverId";
ALTER TABLE "RegionSession" ADD COLUMN "regionId" INTEGER;   -- önce nullable

-- Geçmiş oturumlar pasif arşiv bölgesine bağlanır: regionId NOT NULL invaryantı korunur,
-- entry↔oturum bağı yaşar, active=false olduğu için hiçbir seçicide görünmez.
-- KOŞULLU: oturumu olmayan bir DB'de (ör. taze local) junk satır oluşmaz.
DO $$
DECLARE placeholder_id INT;
BEGIN
  IF EXISTS (SELECT 1 FROM "RegionSession") THEN
    INSERT INTO "Region" ("name", "active") VALUES ('Bilinmiyor (arşiv)', false)
      ON CONFLICT ("name") DO UPDATE SET "active" = false
      RETURNING "id" INTO placeholder_id;
    UPDATE "RegionSession" SET "regionId" = placeholder_id WHERE "regionId" IS NULL;
    -- Şoförsüz kalan oturum devam ettirilemesin
    UPDATE "RegionSession" SET "status" = 'COMPLETED' WHERE "status" = 'ACTIVE';
  END IF;
END $$;

ALTER TABLE "RegionSession" ALTER COLUMN "regionId" SET NOT NULL;
ALTER TABLE "RegionSession" ADD CONSTRAINT "RegionSession_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "RegionSession_regionId_status_idx" ON "RegionSession"("regionId", "status");

-- ============================================================
-- 4) Entry.vehicleSessionId → regionSessionId (RENAME: değerler anlamlı)
-- ============================================================
ALTER TABLE "Entry" DROP CONSTRAINT "Entry_vehicleSessionId_fkey";
ALTER TABLE "Entry" RENAME COLUMN "vehicleSessionId" TO "regionSessionId";
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_regionSessionId_fkey"
  FOREIGN KEY ("regionSessionId") REFERENCES "RegionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 5) Producer.driverId → regionId + allRegions
-- ============================================================
ALTER TABLE "Producer" DROP COLUMN "driverId";   -- FK + Producer_driverId_idx otomatik düşer
ALTER TABLE "Producer" ADD COLUMN "regionId" INTEGER;
ALTER TABLE "Producer" ADD COLUMN "allRegions" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Producer" ADD CONSTRAINT "Producer_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Producer_regionId_idx" ON "Producer"("regionId");
CREATE INDEX "Producer_allRegions_idx" ON "Producer"("allRegions");

-- ============================================================
-- 6) CaseMovement: DRIVER_* sil + driverId düşür
--    ⚠ TEK YIKICI ADIM. Adım 0'da arşivlendi, adım 1'de zararsızlığı kanıtlandı.
--    IN (...) kullanılıyor, LIKE 'DRIVER_%' DEĞİL — '_' LIKE joker'idir.
-- ============================================================
DELETE FROM "CaseMovement" WHERE "type" IN ('DRIVER_OUT','DRIVER_IN','DRIVER_INIT','DRIVER_ADJUST');
ALTER TABLE "CaseMovement" DROP COLUMN "driverId";   -- CaseMovement_driverId_occurredAt_idx otomatik düşer

-- ============================================================
-- 7) Enum daraltma.
--    Adım 6'daki DELETE ŞART: tek bir DRIVER_* satırı USING cast'ini
--    "invalid input value for enum" ile patlatır.
--    CaseMovement.type'ın DEFAULT'u yok (init migration doğrulandı) → DROP/SET DEFAULT gerekmiyor.
-- ============================================================
CREATE TYPE "CaseMovementType_new" AS ENUM ('MARKET_OUT', 'MARKET_IN', 'MARKET_INIT', 'MARKET_ADJUST');
ALTER TABLE "CaseMovement" ALTER COLUMN "type" TYPE "CaseMovementType_new"
  USING ("type"::text::"CaseMovementType_new");
ALTER TYPE "CaseMovementType" RENAME TO "CaseMovementType_old";
ALTER TYPE "CaseMovementType_new" RENAME TO "CaseMovementType";
DROP TYPE "CaseMovementType_old";

-- ============================================================
-- 8) Driver'ı düşür. CASCADE YOK — beklenmedik bir bağımlılık varsa
--    sessizce cascade etmek yerine migration patlasın.
-- ============================================================
DROP TABLE "Driver";
