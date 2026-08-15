-- Tek kullanımlık (siyah/karton) kasa işareti.
-- İşaretli mal kasa muhasebesine HİÇ girmez: ne bölgeye verilen kasa (REGION_IN),
-- ne bayiye yazılan kasa (MARKET_OUT), ne iadede düşülen kasa (MARKET_IN).
-- Bu kasa atılıyor, geri dönmüyor — stoklu kasa değil.
--
-- Elle yazıldı: bu repoda `prisma migrate dev` çalışmıyor (shadow DB replay'i
-- P3006 veriyor) — bkz. 20260729180000_audit_log_entry_source.
--
-- Yıkıcı işlem YOK: DEFAULT'lu iki yeni kolon. Mevcut tüm kayıtlar false başlar,
-- doğrusu bu — bugüne kadar yazılan her kasa geri dönen kasaydı, aksini
-- varsaymak geçmiş bakiyeleri toptan bozar.

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "disposableCase" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ReturnRecord" ADD COLUMN     "disposableCase" BOOLEAN NOT NULL DEFAULT false;

-- Index EKLENMİYOR: depo FIFO sorgusu bu kolona da süzecek ama lider kolonlar
-- (marketId, productId) mevcut Entry_marketId_productId_createdAt_idx ile
-- karşılanıyor; disposableCase index taraması üstünde filtre olarak uygulanıyor
-- ve depodaki satır sayısı sınırlı.
