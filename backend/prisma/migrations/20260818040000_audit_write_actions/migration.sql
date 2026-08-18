-- Denetim kaydına yazma eylemleri için iki kolon.
--
-- SORUN: audit() yalnızca üç yerden çağrılıyordu (export ping'i, ledger okuma,
-- admin liste okuma). Hiçbir YAZMA işlemi loglanmıyordu; bu yüzden kayıtlarda
-- sadece admin panelini gezen kullanıcı görünüyor, sahada mal kabul yapan
-- operatörlerin hiçbir izi bulunmuyordu.
--
-- recordId: silme/düzenlemede "neyi" sorusunun cevabı.
-- detail:   insan okuyabilir özet ("Pazar #3 · Acur · 10 kasa"). Kaydın kendisi
--           silinmiş olabileceği için log tek başına anlaşılabilir olmalı —
--           sonradan JOIN ile geri getirilemez.
--
-- action kolonu genişliyor ama tip değişmiyor (TEXT): READ | EXPORT | CREATE |
-- UPDATE | DELETE | LOGIN | LOGIN_FAIL. Enum'a çevirmek geçmiş satırları
-- migrate etmeyi ve her yeni eylemde şema değişikliğini gerektirirdi.
--
-- Elle yazıldı: bu repoda `prisma migrate dev` çalışmıyor (P3006) —
-- bkz. 20260729180000_audit_log_entry_source.
--
-- Nullable kolonlar, varsayılan yok → geçmiş satırlar etkilenmez. Yıkıcı işlem yok.
-- Geri alma: ALTER TABLE "AuditLog" DROP COLUMN "recordId", DROP COLUMN "detail";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "recordId" INTEGER,
ADD COLUMN     "detail" TEXT;
