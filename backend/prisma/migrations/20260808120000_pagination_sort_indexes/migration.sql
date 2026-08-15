-- Sayfalanan admin listeleri için sıralama index'leri.
--
-- Sorun: bu tablolardaki mevcut index'lerin hepsi composite ve lider kolonları
-- bir filtre alanı (marketId, producerId, resource, ...). Sayfaların VARSAYILAN
-- hâli filtresiz açılıyor ve yalnızca tarihe göre sıralıyor:
--     SELECT ... ORDER BY "occurredAt" DESC LIMIT 50 OFFSET n
-- Postgres bu sorgu için (marketId, occurredAt) index'ini kullanamaz — lider
-- kolon eşleşmiyor. Sonuç: her açılışta seq scan + sort. OFFSET arttıkça da
-- sıralanmış kümenin tamamı yeniden taranır.
--
-- Tek kolonlu index bunu karşılar; DESC gerekmez, btree geriye doğru taranabilir.
-- Filtreli görünümler (bayi/bölge/üretici seçili) mevcut composite'leri
-- kullanmaya devam eder — o index'ler duruyor.

-- CreateIndex
CREATE INDEX "LedgerEntry_occurredAt_idx" ON "LedgerEntry"("occurredAt");

-- CreateIndex
CREATE INDEX "CaseMovement_occurredAt_idx" ON "CaseMovement"("occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ReturnRecord_createdAt_idx" ON "ReturnRecord"("createdAt");

-- İadeler sayfasındaki hedef filtresi (dest=discarded/depo/market) discarded
-- üzerinden süzüp createdAt'e göre sıralıyor — bkz. transferController.listReturns
-- CreateIndex
CREATE INDEX "ReturnRecord_discarded_createdAt_idx" ON "ReturnRecord"("discarded", "createdAt");

-- CreateIndex
CREATE INDEX "Transfer_createdAt_idx" ON "Transfer"("createdAt");
