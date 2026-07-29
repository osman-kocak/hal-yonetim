-- Denetim kaydı + Entry kaynak ayrımı.
--
-- Elle yazıldı: bu repoda `prisma migrate dev` çalışmıyor (migration klasör
-- sırası bozuk, shadow DB replay'i P3006 ile patlıyor). İçerik
-- `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel` çıktısı.
--
-- Yıkıcı işlem yok: yeni enum, yeni tablo, ve DEFAULT'lu yeni kolon.
-- Mevcut Entry satırları HARVEST olur — doğrusu bu, hepsi gerçek mal kabulü.

-- CreateEnum
CREATE TYPE "EntrySource" AS ENUM ('HARVEST', 'RETURN', 'DISCARD');

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "source" "EntrySource" NOT NULL DEFAULT 'HARVEST';

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "username" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "recordCount" INTEGER,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resource_createdAt_idx" ON "AuditLog"("resource", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "Entry_source_createdAt_idx" ON "Entry"("source", "createdAt");
