-- LEGAL FATURA EŞLEŞTİRMESİ + BASKI TAKİBİ — Exit tablosu
--
-- İHTİYAÇ: kesilen irsaliyenin resmi fatura karşılığı sistemde durmuyordu.
-- Muhasebe eşleştirmeyi dışarıda tutuyor ve "bu irsaliye faturalandı mı"
-- sorusunun cevabı hiçbir ekranda yoktu.
--
-- invoiceNo SERBEST METİN ama BENZERSİZ: fatura serileri işletmeye göre değişir,
-- format dayatmak yanlış olur; ancak aynı numaranın iki irsaliyeye yazılması
-- mutabakatı imkânsız kılar.
--
-- NULLABLE + UNIQUE tek kolonda SORUNSUZ: Postgres'te iki NULL eşit sayılmaz,
-- yani onaysız irsaliyeler serbestçe çoğalabilir. (Price'taki tuzak BİLEŞİK
-- unique'ti; orada nullable kolon @@unique'i deliyor ve partial index
-- gerekiyordu — bkz. 20260813190000_price_quality_optional.)
--
-- printedAt/printedBy/printCount: "irsaliye basıldı" rozeti için. Bu bilgi
-- doğası gereği %100 güvenilir DEĞİL (AirPrint paneli iptal edilirse tarayıcı
-- haber vermiyor), o yüzden onay kuyruğu buna bağlanmadı — kuyruğa her irsaliye
-- düşer, baskı yalnızca ayrı bir rozettir.
--
-- printCount NOT NULL DEFAULT 0: mevcut satırlar 0 alır ve "hiç basılmadı"
-- demek olur. Bu doğru DEĞİL (eski irsaliyeler basılmıştı) ama bilinmiyor;
-- printedAt NULL kaldığı için rozet de "bilinmiyor" gösterir, "basılmadı" değil.
--
-- Geri alma: DROP COLUMN (unique index kolonla birlikte düşer).

-- AlterTable
ALTER TABLE "Exit" ADD COLUMN     "invoiceNo" TEXT,
ADD COLUMN     "invoiceAt" TIMESTAMP(3),
ADD COLUMN     "invoiceBy" TEXT,
ADD COLUMN     "printedAt" TIMESTAMP(3),
ADD COLUMN     "printedBy" TEXT,
ADD COLUMN     "printCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Exit_invoiceNo_key" ON "Exit"("invoiceNo");

-- Onay kuyruğu: "fatura no boş olanlar, yeniden eskiye"
CREATE INDEX "Exit_invoiceNo_createdAt_idx" ON "Exit"("invoiceNo", "createdAt");

-- Kolonlar dolu gelirse migration yanlış veritabanında çalışıyor demektir.
DO $$
DECLARE bad INT;
BEGIN
  SELECT COUNT(*) INTO bad FROM "Exit" WHERE "invoiceNo" IS NOT NULL OR "printedAt" IS NOT NULL;
  IF bad > 0 THEN
    RAISE EXCEPTION 'Beklenmeyen durum: % satırda fatura/baskı kolonu zaten dolu', bad;
  END IF;
END $$;
