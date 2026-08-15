-- Üçüncü satış birimi: PIECE (adet). Artık kg / bağ / adet ayrı eksenler.
--
-- NEDEN: bağ ve adet aynı kovada toplanıyordu ("230 bağ/adet"). Muhasebe iki
-- miktarı ayrı görmek istiyor — 150 bağ maydanoz ile 80 adet lahana toplanabilir
-- sayı değil. Bağ listesi olduğu gibi kalır; hangi ürünlerin PIECE olacağı ayrı
-- veri geçişiyle belirlenir (scripts/set-piece-products.js).
--
-- Elle yazıldı: bu repoda `prisma migrate dev` çalışmıyor (P3006) —
-- bkz. 20260729180000_audit_log_entry_source.
--
-- ALTER TYPE ... ADD VALUE'nun eklediği değer AYNI transaction içinde
-- KULLANILAMAZ (bkz. 20260806173000_region_case_tracking). Burada yalnızca
-- ekleniyor — hiçbir satır PIECE yapılmıyor, default da CASE kalıyor — bu
-- yüzden sorun çıkmaz. Ürün geçişi script'te, kasıtlı olarak ayrı.

-- AlterEnum
ALTER TYPE "ProductUnit" ADD VALUE IF NOT EXISTS 'PIECE';
