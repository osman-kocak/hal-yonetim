-- Offline kuyruğun idempotency kaydı.
--
-- iPad kesintide mal kabul kaydını kuyruğa alıyor, bağlantı gelince gönderiyor.
-- "İstek ulaştı, yanıt kayboldu" senaryosunda kalem kuyrukta kalır ve TEKRAR
-- gönderilir; bu tablo olmadan her kesinti çift kayıt üretir (kasa hareketi ve
-- cari borç da ikinci kez yazılır — sessiz muhasebe hatası).
--
-- clientId neden PRIMARY KEY: kontrol atomik olmalı. Bir batch N satır yazıyor,
-- hepsi aynı clientId'yi taşıyor, yani Entry üzerinde unique kolon kurulamıyor.
-- "Önce sor, sonra yaz" ise yarışa açık: retry'ın ilk yanıtı gecikirken ikinci
-- istek gelirse ikisi de "yok" görüp yazar. Transaction'ın ilk adımı bu satırı
-- INSERT etmek; ikinci istek PK ihlaline çarpıp geri dönüyor.
--
-- Elle yazıldı: bu repoda `prisma migrate dev` çalışmıyor (P3006) —
-- bkz. 20260729180000_audit_log_entry_source.
--
-- Yeni tablo, yıkıcı işlem yok. Geri alma: DROP TABLE "SyncedBatch";

-- CreateTable
CREATE TABLE "SyncedBatch" (
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recordIds" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "SyncedBatch_pkey" PRIMARY KEY ("clientId")
);

-- CreateIndex
CREATE INDEX "SyncedBatch_createdAt_idx" ON "SyncedBatch"("createdAt");
