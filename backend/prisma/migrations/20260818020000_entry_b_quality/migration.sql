-- İkinci kalite (B kalite) işareti.
--
-- SADECE ETİKET: kasa muhasebesine karışmaz (utils/cases.js → trackedCases()
-- bu kolonu okumaz, kasa normal sayılır) ve fiyatı değiştirmez. Raporlama ve
-- filtreleme için var — mal kabulde hem parti geneline hem tek satıra
-- işaretlenebiliyor.
--
-- 2026-08-13'te kullanımdan kalkan Quality tablosuyla İLGİSİ YOK: o sistem
-- fiyatı kaliteye bağlıyordu ve carry-forward mantığını karıştırmıştı. Bu düz
-- bir boolean.
--
-- Elle yazıldı: bu repoda `prisma migrate dev` çalışmıyor (P3006) —
-- bkz. 20260729180000_audit_log_entry_source.
--
-- Yeni kolon, varsayılanı false → geçmiş kayıtlar etkilenmez. Yıkıcı işlem yok.
-- Geri alma: ALTER TABLE "Entry" DROP COLUMN "bQuality";

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "bQuality" BOOLEAN NOT NULL DEFAULT false;
