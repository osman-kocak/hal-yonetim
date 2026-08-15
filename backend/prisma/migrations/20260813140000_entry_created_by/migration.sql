-- Girişi kimin oluşturduğu.
--
-- Entry, createdBy taşımayan tek ana tabloydu (Exit, Transfer, LedgerEntry,
-- CaseMovement, ReturnRecord hepsinde var). Admin/muhasebe artık depoya ELLE
-- giriş yapabildiği için gerekli oldu: bölge oturumu olmadan stok yaratan bir
-- kaydın kime ait olduğu bilinmeli.
--
-- Elle yazıldı: bu repoda `prisma migrate dev` çalışmıyor (P3006) —
-- bkz. 20260729180000_audit_log_entry_source.
--
-- Nullable: geçmiş kayıtlarda bu bilgi yok, doldurulamaz. Yıkıcı işlem yok.

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "createdBy" TEXT;
