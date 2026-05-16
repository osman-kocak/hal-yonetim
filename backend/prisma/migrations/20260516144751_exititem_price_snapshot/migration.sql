-- ExitItem'a fiyat snapshot + entry başına tek exit kısıtı
ALTER TABLE "ExitItem" ADD COLUMN "pricePerKg" DOUBLE PRECISION;
CREATE UNIQUE INDEX "ExitItem_entryId_key" ON "ExitItem"("entryId");
