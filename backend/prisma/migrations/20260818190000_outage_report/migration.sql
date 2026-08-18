-- Saha kesinti ölçümü.
--
-- Kesinti süreleri iPad'in localStorage'ında toplanıyordu (`hal_outages`) ve
-- oradan çıkarmanın tek yolu cihazı Mac'e bağlayıp Safari konsolu açmaktı.
-- Veri aylardır birikiyor ama kimse okuyamıyordu; offline mimarisine (Faz 2/3)
-- yatırım kararı da bu veriye dayanacaktı. Artık bağlantı gelince sunucuya
-- gönderiliyor.
--
-- deviceId istemci tarafında üretiliyor: kesinti sırasında sunucu erişilemez
-- olduğu için numarayı sunucu veremez.
--
-- (deviceId, startedAt) UNIQUE: aynı kesinti iki kez yazılmasın. Gönderim
-- başarılı olup yanıtı kaybolursa istemci tekrar dener.
--
-- Elle yazıldı: bu repoda `prisma migrate dev` çalışmıyor (P3006) —
-- bkz. 20260729180000_audit_log_entry_source.
--
-- Yeni tablo, yıkıcı işlem yok. Geri alma: DROP TABLE "OutageReport";

-- CreateTable
CREATE TABLE "OutageReport" (
    "id" SERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "username" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "ms" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutageReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutageReport_deviceId_startedAt_key" ON "OutageReport"("deviceId", "startedAt");

-- CreateIndex
CREATE INDEX "OutageReport_startedAt_idx" ON "OutageReport"("startedAt");
