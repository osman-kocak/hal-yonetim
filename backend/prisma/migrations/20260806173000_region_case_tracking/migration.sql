-- Bölge bazlı kasa takibi: hale gelen boş kasa bölgeye verilir (REGION_OUT),
-- o bölgeden mal kabul edilince kasa dönmüş sayılır (REGION_IN, Entry ile otomatik).

-- ALTER TYPE ... ADD VALUE aynı transaction içinde KULLANILAMAZ (PG kısıtı).
-- Bu migration yalnızca değerleri ekliyor, kullanmıyor — sorun çıkmaz.
ALTER TYPE "CaseMovementType" ADD VALUE 'REGION_OUT';
ALTER TYPE "CaseMovementType" ADD VALUE 'REGION_IN';
ALTER TYPE "CaseMovementType" ADD VALUE 'REGION_ADJUST';

ALTER TABLE "CaseMovement" ADD COLUMN "regionId" INTEGER;
ALTER TABLE "CaseMovement" ADD COLUMN "entryId" INTEGER;

CREATE UNIQUE INDEX "CaseMovement_entryId_key" ON "CaseMovement"("entryId");
CREATE INDEX "CaseMovement_regionId_occurredAt_idx" ON "CaseMovement"("regionId", "occurredAt");

ALTER TABLE "CaseMovement" ADD CONSTRAINT "CaseMovement_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cascade: giriş silinirse kasa hareketi de silinsin, yoksa bölge bakiyesinde
-- karşılığı olmayan bir düşüm kalır.
ALTER TABLE "CaseMovement" ADD CONSTRAINT "CaseMovement_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
