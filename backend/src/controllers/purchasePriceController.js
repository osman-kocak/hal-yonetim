// ALIŞ fiyatı yönetimi — priceController.js'in (satış) eşi.
//
// İkisi bilinçli olarak AYRI dosya: aynı tabloya bakmıyorlar ve iş anlamları
// farklı (Price = bayiye kesilen irsaliye fiyatı, PurchasePrice = üreticiye
// ödenen alış fiyatı). Ortaklaştırılsaydı "hangi fiyat" sorusu her satırda
// bir parametreye dönüşür ve karıştırma riski doğardı — bu sistemde fiyat
// karışması doğrudan para hatası demek.
//
// Carry-forward mantığı aynen kopyalandı çünkü aynı gerçeğe hizmet ediyor:
// fiyat yazıldığı güne değil DEĞİŞTİRİLENE KADAR geçerlidir.

import { prisma } from '../utils/prismaClient.js'
import { audit } from '../utils/audit.js'
import { toPriceDate } from '../utils/date.js'
import { buildPurchasePriceMap } from '../utils/purchasePrices.js'

// ————————————————— Genel alış fiyatı (PurchasePrice) —————————————————

// Bir günün geçerli alış fiyatları. `inherited` alanı satırın o güne mi
// yazıldığını yoksa önceki günden mi devraldığını söyler — ekran
// "12 Ağu'tan devir" notunu buna göre basar.
export async function getPurchasePrices(req, res, next) {
  try {
    const day = toDay(req.query.date)
    if (!day) return res.status(400).json({ error: 'Tarih geçersiz' })

    const rows = await effectivePurchaseRows(day)
    if (!rows.length) return res.json([])

    const prices = await prisma.purchasePrice.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      include: { product: true },
      orderBy: [{ product: { name: 'asc' } }],
    })

    const dayStr = toDayString(day)
    res.json(prices.map((p) => ({ ...p, inherited: toDayString(p.date) !== dayStr })))
  } catch (err) { next(err) }
}

// Alış fiyatı kaydet/güncelle.
//
// prisma.upsert BURADA KULLANILABİLİR — Price'taki findFirst geçici çözümüne
// (priceController.js:56-63) gerek yok: orada compound unique'in bir kolonu
// (qualityId) nullable olduğu için Prisma where'i kabul etmiyordu. PurchasePrice'ın
// unique'i (productId, date) ve ikisi de NOT NULL, yani gerçek unique.
export async function upsertPurchasePrice(req, res, next) {
  try {
    const { productId, pricePerKg, date, updatedBy } = req.body
    if (!productId || pricePerKg === undefined || pricePerKg === null) {
      return res.status(400).json({ error: 'productId ve pricePerKg zorunludur' })
    }
    const priceValue = Number(pricePerKg)
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      return res.status(400).json({ error: 'Fiyat sıfır veya pozitif bir sayı olmalıdır' })
    }
    const day = toDay(date)
    if (!day) return res.status(400).json({ error: 'Tarih geçersiz' })

    const pid = Number(productId)
    const existing = await prisma.purchasePrice.findUnique({
      where: { productId_date: { productId: pid, date: day } },
      select: { id: true, pricePerKg: true },
    })

    const saved = await prisma.purchasePrice.upsert({
      where: { productId_date: { productId: pid, date: day } },
      update: { pricePerKg: priceValue, updatedBy: updatedBy ?? null },
      create: { productId: pid, pricePerKg: priceValue, date: day, updatedBy: updatedBy ?? null },
      include: { product: true },
    })

    // Alış fiyatı üreticiye yazılan borcu doğrudan belirliyor — satış fiyatıyla
    // aynı gerekçe: "kim ne zaman kaça çekti" tek satırda okunabilmeli.
    // Eski değer de yazılıyor.
    audit(req, {
      action: existing ? 'UPDATE' : 'CREATE',
      resource: 'purchase-price',
      recordId: saved.id,
      detail: `${saved.product?.name ?? 'Ürün'} · alış ${saved.pricePerKg} TL`
        + (existing ? ` (önceki ${existing.pricePerKg})` : ''),
    })
    res.json(saved)
  } catch (err) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'Bu fiyat aynı anda başka bir kullanıcı tarafından kaydedildi, sayfayı yenileyin' })
    }
    next(err)
  }
}

// ————————————————— Üretici özel alış fiyatı (ProducerPrice) —————————————————

// Bir üreticinin o gün geçerli özel fiyatları. İptal edilmiş (cancelled) satırlar
// da DÖNER — ekran "burada bir zamanlar özel fiyat vardı, kaldırıldı" ayrımını
// gösterebilsin diye. Çözümleyici (purchasePriceOf) onları zaten yok sayıyor.
export async function getProducerPrices(req, res, next) {
  try {
    const day = toDay(req.query.date)
    if (!day) return res.status(400).json({ error: 'Tarih geçersiz' })
    const producerId = Number(req.params.producerId ?? req.query.producerId)
    if (!Number.isInteger(producerId)) return res.status(400).json({ error: 'Üretici geçersiz' })

    const rows = await effectiveProducerRows(day, [producerId])
    if (!rows.length) return res.json([])

    const prices = await prisma.producerPrice.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      include: { product: true },
      orderBy: [{ product: { name: 'asc' } }],
    })

    const dayStr = toDayString(day)
    res.json(prices.map((p) => ({ ...p, inherited: toDayString(p.date) !== dayStr })))
  } catch (err) { next(err) }
}

export async function upsertProducerPrice(req, res, next) {
  try {
    const { producerId, productId, pricePerKg, date, updatedBy } = req.body
    if (!producerId || !productId || pricePerKg === undefined || pricePerKg === null) {
      return res.status(400).json({ error: 'producerId, productId ve pricePerKg zorunludur' })
    }
    const priceValue = Number(pricePerKg)
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      return res.status(400).json({ error: 'Fiyat sıfır veya pozitif bir sayı olmalıdır' })
    }
    const day = toDay(date)
    if (!day) return res.status(400).json({ error: 'Tarih geçersiz' })

    const prid = Number(producerId)
    const pid = Number(productId)
    const key = { producerId_productId_date: { producerId: prid, productId: pid, date: day } }
    const existing = await prisma.producerPrice.findUnique({ where: key, select: { id: true, pricePerKg: true } })

    const saved = await prisma.producerPrice.upsert({
      where: key,
      // cancelled: false — iptal edilmiş bir satırın üstüne yazmak onu diriltir.
      // "Kaldırdım, sonra fikrimi değiştirdim" akışı çalışsın diye.
      update: { pricePerKg: priceValue, cancelled: false, updatedBy: updatedBy ?? null },
      create: { producerId: prid, productId: pid, pricePerKg: priceValue, date: day, updatedBy: updatedBy ?? null },
      include: { product: true, producer: true },
    })

    audit(req, {
      action: existing ? 'UPDATE' : 'CREATE',
      resource: 'producer-price',
      recordId: saved.id,
      detail: `${saved.producer?.name ?? 'Üretici'} · ${saved.product?.name ?? 'Ürün'} · özel alış ${saved.pricePerKg} TL`
        + (existing ? ` (önceki ${existing.pricePerKg})` : ''),
    })
    res.json(saved)
  } catch (err) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'Bu fiyat aynı anda başka bir kullanıcı tarafından kaydedildi, sayfayı yenileyin' })
    }
    next(err)
  }
}

// Özel fiyatı KALDIR — satırı silmez, mezar taşı bırakır.
//
// DELETE ETMEK YANLIŞ OLURDU: carry-forward yüzünden satır silinince bir önceki
// tarihli özel fiyat devreye girer ve "kaldırdım" denen fiyat kendiliğinden geri
// gelir. cancelled=true çözümleyiciye "bu üretici+ürün için özel fiyat YOK" der,
// prim/genel katmanına düşülür, geçmiş kayıtlar da bozulmaz.
//
// İptal SEÇİLEN GÜNE yazılır: dünkü irsaliyeler dünkü fiyattan hesaplanmış
// kalır, iptal bugünden itibaren geçerli olur.
export async function cancelProducerPrice(req, res, next) {
  try {
    const day = toDay(req.body?.date)
    if (!day) return res.status(400).json({ error: 'Tarih geçersiz' })
    const id = Number(req.params.id)
    const row = await prisma.producerPrice.findUnique({
      where: { id },
      include: { product: true, producer: true },
    })
    if (!row) return res.status(404).json({ error: 'Özel fiyat bulunamadı' })

    const key = { producerId_productId_date: { producerId: row.producerId, productId: row.productId, date: day } }
    const saved = await prisma.producerPrice.upsert({
      where: key,
      update: { cancelled: true, updatedBy: req.user?.name || req.user?.username || null },
      // Devralınmış bir satır iptal ediliyorsa o güne yeni bir mezar taşı açılır.
      // pricePerKg korunuyor: "hangi fiyat iptal edildi" bilgisi kaybolmasın.
      create: {
        producerId: row.producerId, productId: row.productId, pricePerKg: row.pricePerKg,
        date: day, cancelled: true, updatedBy: req.user?.name || req.user?.username || null,
      },
      include: { product: true, producer: true },
    })

    audit(req, {
      action: 'DELETE',
      resource: 'producer-price',
      recordId: saved.id,
      detail: `${saved.producer?.name ?? 'Üretici'} · ${saved.product?.name ?? 'Ürün'} · özel fiyat kaldırıldı (${row.pricePerKg} TL)`,
    })
    res.json(saved)
  } catch (err) { next(err) }
}

// ————————————————— Çözümleme için map —————————————————

// Belirli gün + belirli üreticiler için alış fiyatı map'i.
// Okuma HER ZAMAN utils/purchasePrices.js → purchasePriceOf() üzerinden
// yapılmalı; buradaki map ham veridir, katman mantığı orada.
//
// producerIds boşsa özel fiyat sorgusu hiç açılmaz — mal kabul partisi tek
// üreticiye ait olduğu için tipik çağrı tek elemanlı dizidir.
export async function getPurchasePriceMap(date, producerIds = []) {
  const day = toDay(date ?? new Date())
  if (!day) return { general: {}, special: {} }
  const ids = (producerIds ?? []).map(Number).filter(Number.isInteger)
  const [general, special] = await Promise.all([
    effectivePurchaseRows(day),
    ids.length ? effectiveProducerRows(day, ids) : Promise.resolve([]),
  ])
  return buildPurchasePriceMap({ general, special })
}

// O tarihte GEÇERLİ genel alış fiyatı satırları — ürün başına bir satır.
// DISTINCT ON, ≤ gün olan EN SON satırı seçer (carry-forward).
//
// Tarih metin olarak gidip ::date'e cast ediliyor: JS Date gönderilseydi
// Postgres onu timestamptz sayıp sunucu saat dilimine göre bir gün
// kaydırabilirdi (bkz. utils/date.js'teki aynı tuzak).
async function effectivePurchaseRows(day) {
  return prisma.$queryRaw`
    SELECT DISTINCT ON ("productId")
      id, "productId", "pricePerKg", date
    FROM "PurchasePrice"
    WHERE date <= ${toDayString(day)}::date
    ORDER BY "productId", date DESC
  `
}

// O tarihte geçerli üretici özel fiyatları — (üretici, ürün) başına bir satır.
// cancelled kolonu SELECT'e dahil: iptal edilmiş satır da "en son satır" olarak
// seçilmeli ki carry-forward bir öncekini diriltmesin. Yok sayma işi
// buildPurchasePriceMap'te yapılıyor.
async function effectiveProducerRows(day, producerIds) {
  return prisma.$queryRaw`
    SELECT DISTINCT ON ("producerId", "productId")
      id, "producerId", "productId", "pricePerKg", cancelled, date
    FROM "ProducerPrice"
    WHERE date <= ${toDayString(day)}::date
      AND "producerId" = ANY(${producerIds}::int[])
    ORDER BY "producerId", "productId", date DESC
  `
}

function toDayString(d) {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)
}

// toPriceDate yerel takvim gününü baz alır — TR'de gece 00:00-03:00 arasında
// UTC hâlâ önceki gün olduğu için düz new Date() bir gün geriden okurdu.
function toDay(date) {
  return toPriceDate(date ?? new Date())
}
