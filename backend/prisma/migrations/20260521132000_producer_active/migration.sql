-- AlterTable
ALTER TABLE "Producer" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Producer_active_idx" ON "Producer"("active");
