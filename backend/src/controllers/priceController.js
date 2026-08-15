import { prisma } from '../utils/prismaClient.js'
import { toPriceDate, localDateString } from '../utils/date.js'
import { buildPriceMap } from '../utils/prices.js'

// Belirli bir gün için GEÇERLİ fiyat satırları. Genel fiyatlarda quality null döner.
//
// Satırlar carry-forward ile bulunur (bkz. effectivePriceRows): o güne fiyat
// yazılmamışsa önceki günden devralınan satır döner. `inherited` alanı hangisi
// olduğunu söyler — ekran "12 Ağu'tan devir" notunu buna göre basar.
export async function getPrices(req, res, next) {
  try {
    const day = toDay(req.query.date)
    if (!day) return res.status(400).json({ error: 'Tarih geçersiz' })

    const rows = await effectivePriceRows(day)
    if (!rows.length) return res.json([])

    const prices = await prisma.price.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      include: { product: true, quality: true },
      // quality nullable olduğu için ona göre sıralama genel satırları rastgele
      // yere atıyor; ürün adı yeterli, ekran zaten ürün başına tek satır.
      orderBy: [{ product: { name: 'asc' } }],
    })

    const dayStr = toDayString(day)
    res.json(prices.map((p) => ({
      ...p,
      inherited: toDayString(p.date) !== dayStr,
    })))
  } catch (err) { next(err) }
}

// Fiyat kaydet ya da güncelle.
//
// qualityId ARTIK OPSİYONEL: verilmezse ürünün GENEL fiyatı yazılır (yeni
// standart, kalite kullanımdan kalktı). Verilirse eski kaliteli satır güncellenir
// — geçmiş düzeltmeleri hâlâ mümkün olsun diye kapatılmadı.
export async function upsertPrice(req, res, next) {
  try {
    const { productId, qualityId, pricePerKg, date, updatedBy } = req.body
    if (!productId || pricePerKg === undefined || pricePerKg === null) {
      return res.status(400).json({ error: 'productId ve pricePerKg zorunludur' })
    }
    const priceValue = Number(pricePerKg)
    if (isNaN(priceValue) || priceValue < 0) {
      return res.status(400).json({ error: 'Fiyat sıfır veya pozitif bir sayı olmalıdır' })
    }
    const day = toDay(date)
    if (!day) return res.status(400).json({ error: 'Tarih geçersiz' })

    const pid = Number(productId)
    const qid = qualityId == null || qualityId === '' ? null : Number(qualityId)

    // prisma.upsert KULLANILAMAZ genel fiyatta: compound unique'in bir kolonu
    // null olduğunda Prisma o where'i kabul etmiyor (ve Postgres'te NULL'lu
    // unique zaten eşleşmiyor). Tekilliği migration'daki partial index koruyor;
    // burada önce arayıp sonra yazıyoruz.
    const existing = await prisma.price.findFirst({
      where: { productId: pid, qualityId: qid, date: day },
      select: { id: true },
    })

    const saved = existing
      ? await prisma.price.update({
        where: { id: existing.id },
        data: { pricePerKg: priceValue, updatedBy: updatedBy ?? null },
        include: { product: true, quality: true },
      })
      : await prisma.price.create({
        data: { productId: pid, qualityId: qid, pricePerKg: priceValue, date: day, updatedBy: updatedBy ?? null },
        include: { product: true, quality: true },
      })
    res.json(saved)
  } catch (err) {
    // İki muhasebeci aynı anda aynı hücreyi yazdı: partial unique index P2002
    // veriyor. Kullanıcıya "kaydedilemedi" demek yerine yenilemesini söyle —
    // veri kaybı yok, diğerinin yazdığı değer duruyor.
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'Bu fiyat aynı anda başka bir kullanıcı tarafından kaydedildi, sayfayı yenileyin' })
    }
    next(err)
  }
}

// Operatör paneli için günlük fiyat map'i. Fiyat = ticari sır; operatör
// yalnızca BUGÜNÜN fiyatına ihtiyaç duyar. Geçmiş tarih zaman serisi kurup
// fiyat politikasını dışarı çıkarmaya yarar — bu yüzden geçmiş sorgu ADMIN/
// ACCOUNTING'e kısıtlı.
export async function getPublicPrices(req, res, next) {
  try {
    const day = toDay(req.query.date)
    if (!day) return res.status(400).json({ error: 'Tarih geçersiz' })

    if (req.query.date && req.query.date !== localDateString()) {
      const roles = Array.isArray(req.user?.roles) ? req.user.roles : []
      const privileged = roles.some((r) => ['ADMIN', 'ACCOUNTING'].includes(String(r).toUpperCase()))
      if (!privileged) {
        return res.status(403).json({ error: 'Geçmiş tarih fiyatlarına erişim yetkiniz yok' })
      }
    }

    const rows = await effectivePriceRows(day)
    // { "productId": genel fiyat, "productId_qualityId": eski kaliteli fiyat }
    res.json(buildPriceMap(rows))
  } catch (err) { next(err) }
}

// Belirli tarih için fiyat map'i. İki katman taşır (genel + eski kaliteli);
// okuma her zaman utils/prices.js → priceOf() üzerinden yapılmalı.
export async function getPriceMap(date) {
  const day = toDay(date ?? new Date())
  if (!day) return {}
  const rows = await effectivePriceRows(day)
  return buildPriceMap(rows)
}

// O tarihte GEÇERLİ fiyat satırları — her (ürün, kalite) çifti için bir satır.
//
// Fiyat, YAZILDIĞI GÜNE değil DEĞİŞTİRİLENE KADAR geçerlidir. Eskiden okuma
// `where: { date: day }` idi: muhasebeci domatese 10 TL yazıp ertesi gün
// dokunmayınca o gün fiyat bulunamıyor, irsaliyede "—" çıkıyor ve ciro eksik
// hesaplanıyordu — sahadan "fiyat her gün sıfırlanıyor" olarak görünen şey bu.
// Artık o güne satır yoksa önceki en yakın gün devralınır.
//
// DISTINCT ON her çift için ≤ gün olan EN SON satırı seçer; NULL qualityId'ler
// tek grup sayılır, yani genel fiyat da doğru devrolur. Sıralama
// @@unique([productId, qualityId, date]) indeksiyle birebir örtüşüyor,
// ek indekse gerek yok.
//
// Tarih parametresi metin olarak gidip ::date'e cast ediliyor: JS Date olarak
// gönderilse Postgres onu timestamptz sayıp sunucu saat dilimine göre bir gün
// kaydırabilirdi (bkz. utils/date.js'teki aynı tuzak).
async function effectivePriceRows(day) {
  return prisma.$queryRaw`
    SELECT DISTINCT ON ("productId", "qualityId")
      id, "productId", "qualityId", "pricePerKg"
    FROM "Price"
    WHERE date <= ${toDayString(day)}::date
    ORDER BY "productId", "qualityId", date DESC
  `
}

function toDayString(d) {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)
}

// toDay() new Date()'i doğrudan UTC gün başına yuvarlıyordu: TR'de gece
// 00:00-03:00 arasında UTC hâlâ önceki gün olduğu için fiyatlar bir gün
// geriden okunuyordu. toPriceDate() yerel takvim gününü baz alır.
// Geçersiz tarihte null döner — çağıran 400 verebilsin diye.
function toDay(date) {
  return toPriceDate(date ?? new Date())
}
