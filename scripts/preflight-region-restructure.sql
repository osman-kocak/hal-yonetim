-- Bölge yeniden yapılandırması — PROD ÖN-KONTROL (READ-ONLY)
--
-- Migration yazılmadan/deploy edilmeden ÖNCE çalıştırılır.
-- Tamamı read-only transaction içinde — yanlışlıkla bile veri değiştiremez.
--
-- Çalıştırma:
--   scp -P 2222 scripts/preflight-region-restructure.sql root@srv1671139.hstgr.cloud:/tmp/
--   ssh -p 2222 root@srv1671139.hstgr.cloud \
--     'cd /var/www/mskocak.cloud/backend && \
--      export $(grep -E "^DATABASE_URL=" .env | sed "s/[\"'\'']//g" | xargs) && \
--      psql "$DATABASE_URL" -f /tmp/preflight-region-restructure.sql'

BEGIN;
SET TRANSACTION READ ONLY;

\echo ''
\echo '=== 0) KAPI: migrate deploy calisabilir mi? ==============================='
\echo '    10 migration da finished_at DOLU olmali. Bos/eksikse DUR:'
\echo '    migrate deploy P3005 verir, deploy.sh (set -e) abort eder.'
\echo '    Cozum: npx prisma migrate resolve --applied <isim>  (her biri icin)'
SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
FROM "_prisma_migrations"
ORDER BY started_at;

\echo ''
\echo '=== 1) Satir sayilari (kapsam) ==========================================='
SELECT 'Producer'       AS tablo, count(*) FROM "Producer"
UNION ALL SELECT 'Driver',         count(*) FROM "Driver"
UNION ALL SELECT 'VehicleSession', count(*) FROM "VehicleSession"
UNION ALL SELECT 'Entry',          count(*) FROM "Entry"
UNION ALL SELECT 'CaseMovement',   count(*) FROM "CaseMovement"
UNION ALL SELECT 'ReturnRecord',   count(*) FROM "ReturnRecord"
UNION ALL SELECT 'Exit',           count(*) FROM "Exit";

\echo ''
\echo '=== 2) CaseMovement tip dagilimi ========================================='
\echo '    Kac DRIVER_* satiri silinecek? MARKET_* icinde marketId NULL olan var mi?'
\echo '    (null_market = 0 ise migration #2 ile marketId SET NOT NULL yapilabilir)'
SELECT "type",
       count(*)                                        AS satir,
       sum(qty)                                        AS qty_toplam,
       count(*) FILTER (WHERE "marketId" IS NULL)      AS null_market,
       min("occurredAt")::date                         AS ilk,
       max("occurredAt")::date                         AS son
FROM "CaseMovement"
GROUP BY "type"
ORDER BY 1;

\echo ''
\echo '=== 3) *** KRITIK *** DRIVER_* satirlari saf sofor kaydi mi? ============='
\echo '    UCU DE 0 DONMELI. Herhangi biri >0 ise DUR — silme premisi yanlis,'
\echo '    tasarim bastan gozden gecirilmeli.'
SELECT
  count(*) FILTER (WHERE "marketId" IS NOT NULL) AS driver_satiri_marketid_tasiyor,
  count(*) FILTER (WHERE "exitId"   IS NOT NULL) AS driver_satiri_exitid_tasiyor,
  (SELECT count(*) FROM "ReturnRecord" r
     JOIN "CaseMovement" c ON c."id" = r."caseMovementId"
    WHERE c."type" IN ('DRIVER_OUT','DRIVER_IN','DRIVER_INIT','DRIVER_ADJUST')
  ) AS iade_kaydi_driver_satirina_bagli
FROM "CaseMovement"
WHERE "type" IN ('DRIVER_OUT','DRIVER_IN','DRIVER_INIT','DRIVER_ADJUST');

\echo ''
\echo '=== 4) Producer.name @unique karari ======================================'
\echo '    Ikisi de BOS donmeli. Doluysa: @unique migration #2 ye ertelenir,'
\echo '    mukerrerler elle birlestirilir (entry/ledger sahibi id korunur).'
\echo '    -- 4a: tam ayni isimler'
SELECT name, count(*) AS adet, array_agg(id) AS idler
FROM "Producer" GROUP BY name HAVING count(*) > 1;

\echo '    -- 4b: normalize edilince cakisanlar (buyuk/kucuk + bosluk farki)'
SELECT lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) AS normalize,
       count(*) AS adet, array_agg(id) AS idler, array_agg(name) AS isimler
FROM "Producer" GROUP BY 1 HAVING count(*) > 1;

\echo ''
\echo '=== 5) Mevcut ureticiler + referans sayilari ============================='
\echo '    Import bunlari asla silmez. Excel de olmayanlar regionId=NULL kalir'
\echo '    -> hicbir bolge listesinde gorunmez. entry/ledger>0 olanlara dikkat.'
SELECT p.id, p.name, p."driverId", p.active,
       (SELECT count(*) FROM "Entry"       e WHERE e."producerId" = p.id) AS entry_sayisi,
       (SELECT count(*) FROM "LedgerEntry" l WHERE l."producerId" = p.id) AS ledger_sayisi
FROM "Producer" p
ORDER BY p.name;

\echo ''
\echo '=== 6) Oturumlar: placeholder bolge gerekecek mi? ========================'
\echo '    Satir varsa migration "Bilinmiyor (arsiv)" pasif bolgesini yaratir'
\echo '    ve gecmis oturumlari ona baglar. Sifirsa placeholder olusmaz.'
SELECT vs.status, count(DISTINCT vs.id) AS oturum, count(e.id) AS entry
FROM "VehicleSession" vs
LEFT JOIN "Entry" e ON e."vehicleSessionId" = vs.id
GROUP BY vs.status;

\echo ''
\echo '=== 7) Driver a bakan FK lar ============================================='
\echo '    Sadece 3 bilinen cikmali: Producer, VehicleSession, CaseMovement.'
\echo '    Fazlasi varsa DROP TABLE "Driver" patlar (CASCADE kullanmiyoruz).'
SELECT conrelid::regclass AS kaynak_tablo, conname AS constraint_adi
FROM pg_constraint
WHERE confrelid = '"Driver"'::regclass;

\echo ''
\echo '=== 8) CaseMovement.type DEFAULT u var mi? =============================='
\echo '    column_default BOS bekleniyor. Doluysa enum swap sirasinda'
\echo '    DROP DEFAULT / SET DEFAULT adimlari eklenmeli.'
SELECT column_name, column_default, is_nullable, udt_name
FROM information_schema.columns
WHERE table_name = 'CaseMovement' AND column_name = 'type';

\echo ''
\echo '=== 9) CaseMovementType enum unu baska kullanan var mi? =================='
\echo '    Sadece CaseMovement/type cikmali. Fazlasi varsa enum swap eksik kalir.'
SELECT c.relname AS tablo, a.attname AS sutun
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
WHERE a.atttypid = '"CaseMovementType"'::regtype
  AND a.attnum > 0 AND NOT a.attisdropped;

\echo ''
\echo '=== 10) Rename i bloklayan view var mi? =================================='
\echo '    BOS bekleniyor. View varsa ALTER TABLE ... RENAME patlar;'
\echo '    migration cevresinde drop/recreate gerekir.'
SELECT schemaname, viewname FROM pg_views WHERE schemaname = 'public';

\echo ''
\echo '=== 11) REFERANS: migration ONCESI pazar bakiyeleri ======================'
\echo '    BU CIKTIYI SAKLA. Migration sonrasi birebir AYNI olmali —'
\echo '    DRIVER_* satirlarini silmenin onemli hicbir seyi bozmadiginin kaniti.'
SELECT "marketId",
       sum(CASE WHEN "type" IN ('MARKET_OUT','MARKET_INIT','MARKET_ADJUST') THEN qty
                WHEN "type" = 'MARKET_IN' THEN -qty
                ELSE 0 END) AS bakiye
FROM "CaseMovement"
WHERE "marketId" IS NOT NULL
GROUP BY 1
ORDER BY 1;

COMMIT;
