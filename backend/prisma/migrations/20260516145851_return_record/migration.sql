-- ReturnRecord tablosu: iade kayıtları + bağlı entry/ledger/casemovement ID'leri
CREATE TABLE "ReturnRecord" (
    "id" SERIAL PRIMARY KEY,
    "marketId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "qualityId" INTEGER,
    "caseCount" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "pricePerKg" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "weak" BOOLEAN NOT NULL DEFAULT false,
    "discarded" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "entryId" INTEGER,
    "ledgerEntryId" INTEGER,
    "caseMovementId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT
);

CREATE UNIQUE INDEX "ReturnRecord_entryId_key" ON "ReturnRecord"("entryId");
CREATE UNIQUE INDEX "ReturnRecord_ledgerEntryId_key" ON "ReturnRecord"("ledgerEntryId");
CREATE UNIQUE INDEX "ReturnRecord_caseMovementId_key" ON "ReturnRecord"("caseMovementId");
CREATE INDEX "ReturnRecord_marketId_createdAt_idx" ON "ReturnRecord"("marketId", "createdAt");

ALTER TABLE "ReturnRecord" ADD CONSTRAINT "ReturnRecord_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnRecord" ADD CONSTRAINT "ReturnRecord_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnRecord" ADD CONSTRAINT "ReturnRecord_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReturnRecord" ADD CONSTRAINT "ReturnRecord_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReturnRecord" ADD CONSTRAINT "ReturnRecord_caseMovementId_fkey" FOREIGN KEY ("caseMovementId") REFERENCES "CaseMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
