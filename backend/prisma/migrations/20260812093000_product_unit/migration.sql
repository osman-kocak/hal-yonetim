-- Ürün satış birimi: kasa (varsayılan) veya bağ/adet.
--
-- Bağ/adetli ürünlerde (maydanoz, marul, roka, dereotu…) kasa hesabı HİÇ
-- tutulmaz. Entry.caseCount 0 yazılır, miktar bağ adedi olarak weight
-- kolonunda durur, Price.pricePerKg ₺/bağ anlamına gelir. Fatura formülü
-- (pricePerKg * weight) iki birimde de aynı kaldığı için irsaliye/cari
-- hesap kodu değişmiyor.
--
-- Elle yazıldı: bu repoda `prisma migrate dev` çalışmıyor (P3006) —
-- bkz. 20260729180000_audit_log_entry_source.
--
-- Bu migration YALNIZCA şemayı hazırlar; hiçbir ürünü BUNCH yapmaz.
-- Veri geçişi ayrı dosyada (20260812094000_seed_bunch_products), çünkü
-- cutover'ın gün sonunda ve açık irsaliye kalmamışken yapılması gerekiyor.
--
-- CREATE TYPE ile ALTER TYPE ... ADD VALUE'yu karıştırma: YENİ bir tip aynı
-- transaction içinde kullanılabilir, VAR OLAN tipe eklenen değer kullanılamaz
-- (bkz. 20260806173000_region_case_tracking).

-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('CASE', 'BUNCH');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "unit" "ProductUnit" NOT NULL DEFAULT 'CASE';

-- AlterTable
-- SNAPSHOT: ürünün birimi sonradan değişirse geçmiş irsaliyeler yeniden
-- basıldığında "150 bağ"ı "150,00 kg" göstermemeli. Aynı gerekçe
-- ExitItem.pricePerKg için de yazılıydı.
ALTER TABLE "Entry" ADD COLUMN        "unit" "ProductUnit" NOT NULL DEFAULT 'CASE';

-- AlterTable
ALTER TABLE "ReturnRecord" ADD COLUMN "unit" "ProductUnit" NOT NULL DEFAULT 'CASE';

-- Mevcut 136 ürün ve tüm geçmiş kayıtlar CASE olur — doğrusu bu, hepsi
-- kasayla alınıp satıldı. Davranış değişikliği YOK.
