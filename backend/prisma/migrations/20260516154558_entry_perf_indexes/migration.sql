-- Entry: FIFO transfer + tarih sorgu performansı için composite + tek index
CREATE INDEX "Entry_marketId_productId_createdAt_idx" ON "Entry"("marketId", "productId", "createdAt");
CREATE INDEX "Entry_createdAt_idx" ON "Entry"("createdAt");
