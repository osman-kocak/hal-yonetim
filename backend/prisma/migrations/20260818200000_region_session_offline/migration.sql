-- Offline'da yeni bölge oturumu açabilmek için iki değişiklik.
--
-- SORUN: mal kabul kesintide çalışıyordu ama YALNIZCA açık bir bölge oturumu
-- varsa. Yeni bölgeye geçmek için sunucudan RegionSession.id almak gerekiyordu;
-- kesintide o numara üretilemediği için operatör bölge değiştiremiyordu.
--
-- ÇÖZÜM (doğal anahtar): istemci offline'da oturum id'si uydurmaz. Mal kabul
-- partisi regionSessionId yerine regionId gönderir; sunucu sync sırasında o
-- bölgenin AÇIK oturumunu bulur, yoksa açar. Kuyrukta bağımlılık grafiği
-- gerekmiyor, düz FIFO korunuyor (bkz. lib/syncQueue.js).
--
-- 1) openedAt: oturumun GERÇEK açılış anı. createdAt sync anını gösterir;
--    offline açılan oturumun saatler sonra yazılması "bölge saat 15:00'te
--    açıldı" demeye yol açardı.
ALTER TABLE "RegionSession" ADD COLUMN     "openedAt" TIMESTAMP(3);

-- Geçmiş kayıtlar: açılış anı olarak createdAt kabul ediliyor (o dönemde
-- oturumlar zaten anında yazılıyordu, ikisi aynı).
UPDATE "RegionSession" SET "openedAt" = "createdAt" WHERE "openedAt" IS NULL;

-- 2) Bölge başına TEK açık oturum — zaten iş kuralıydı ama yalnızca uygulama
--    katmanında korunuyordu (startRegion "varsa döndür, yoksa yarat").
--    Offline sync ile aynı bölge iki cihazdan aynı anda gelebileceği için
--    veritabanı seviyesinde garanti gerekiyor: iki istek yarışırsa biri
--    unique ihlaline çarpıp mevcut oturumu okuyacak.
--
--    Partial index: yalnızca ACTIVE satırlar tekil. COMPLETED oturumlar bir
--    bölgede sınırsız birikir, onlara dokunulmuyor.
--
--    Uygulanmadan önce iki veritabanında da ihlal olmadığı doğrulandı.
CREATE UNIQUE INDEX "RegionSession_active_per_region_key"
  ON "RegionSession"("regionId") WHERE status = 'ACTIVE';
