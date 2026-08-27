-- MAL KABUL KASA SNAPSHOT'I — Entry.purchaseCases
--
-- SORUN: Entry.caseCount CANLI stoktur. Kısmî transferde parçadan düşülüyor
-- (transferController → remainingCases / movedCases), yani bölünmüş bir mal
-- kabulün caseCount'u giriş anındakinden AZ olur.
--
-- Bu, /admin/depo "Geçmiş" ekranında yanlış cevap üretiyordu: "bugün depoya
-- 40 kasa girdi" diye açılan bir giriş, 15 kasası öğleden sonra sevk edilince
-- geçmişte "25 kasa girdi" gibi görünüyor ve günün giriş kasa toplamı eksiliyor.
--
-- ÇÖZÜM: purchaseQty (miktar snapshot'ı) ile birebir aynı desen — giriş anında
-- donan ayrı bir kasa kolonu. purchaseQty zaten aynı gerekçeyle vardı, kasa
-- ekseni o zaman atlanmıştı.
--
-- DOLDURMA KURALI (purchaseQty ile aynı): yalnızca GERÇEK mal kabulde yazılır —
-- createEntryBatch, createManualDepoEntry ve mal kabul düzeltmesi. Transfer/
-- bölme ile doğan parçalarda NULL kalır; o parçalar yeni bir mal kabul değil,
-- var olan malın taşınmış yarısıdır (aynı gerekçe purchaseQty için de yazılı).
--
-- NULLABLE ve EKLEMELİ: mevcut satırlar etkilenmez. Okuyan taraf
-- `purchaseCases ?? caseCount` ile eski kayıtlarda bugünkü davranışa düşer.
-- Geri alma: DROP COLUMN.

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "purchaseCases" INTEGER;

-- Kolon dolu gelirse migration yanlış veritabanında çalışıyor demektir.
DO $$
DECLARE bad INT;
BEGIN
  SELECT count(*) INTO bad FROM "Entry" WHERE "purchaseCases" IS NOT NULL;
  IF bad > 0 THEN
    RAISE EXCEPTION 'IPTAL: yeni kolon dolu geldi (%), 0 bekleniyordu', bad;
  END IF;
END $$;
