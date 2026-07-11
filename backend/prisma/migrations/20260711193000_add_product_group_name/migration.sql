-- AlterTable: ürün ana-ürün/grup adı (nullable, additive — veri kaybı yok)
ALTER TABLE "Product" ADD COLUMN "groupName" TEXT;

-- CreateIndex
CREATE INDEX "Product_groupName_idx" ON "Product"("groupName");
