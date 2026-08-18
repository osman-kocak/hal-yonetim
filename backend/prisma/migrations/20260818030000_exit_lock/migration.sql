-- Çıkış (irsaliye) ekranı kilidi — pazar başına tek kullanıcı.
--
-- NEDEN: aynı pazarı iki operatör aynı anda açınca ikisi de kalem seçip irsaliye
-- kesiyor. İkincisi ExitItem'ın entryId tekilliğine çarpıp 409 alıyor, ama o anda
-- mal fiziksel olarak yüklenmiş oluyor. Kilit çakışmayı ekran açılışında
-- engelliyor, POST anında değil.
--
-- marketId PRIMARY KEY: pazar başına tek satır; çakışma veritabanı seviyesinde
-- imkânsız, farklı pazarlar birbirini beklemez.
--
-- heartbeatAt: açık ekran 30 sn'de bir yeniliyor, 2 dakika sessiz kalan kilit
-- devralınabiliyor. iPad kilitlenir/pil biterse pazar sonsuza kadar kilitli
-- kalmasın diye — "kilidi bırak" isteğine güvenilmiyor.
--
-- Elle yazıldı: bu repoda `prisma migrate dev` çalışmıyor (P3006) —
-- bkz. 20260729180000_audit_log_entry_source.
--
-- Yeni tablo, yıkıcı işlem yok. Geri alma: DROP TABLE "ExitLock";

-- CreateTable
CREATE TABLE "ExitLock" (
    "marketId" INTEGER NOT NULL,
    "userId" INTEGER,
    "username" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExitLock_pkey" PRIMARY KEY ("marketId")
);

-- CreateIndex
CREATE INDEX "ExitLock_heartbeatAt_idx" ON "ExitLock"("heartbeatAt");

-- AddForeignKey
-- Pazar silinirse kilidi de gitsin; kilit kaydının tek başına anlamı yok.
ALTER TABLE "ExitLock" ADD CONSTRAINT "ExitLock_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
