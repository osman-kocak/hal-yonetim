// KASA DARASI — uçtan uca. GERÇEK controller'lar, GERÇEK veritabanı.
//
// Birim testler applyTare'i kanıtlıyor; bu dosya darayı gerçekten kayda ve
// PARAYA doğru yansıtıp yansıtmadığımızı kanıtlıyor: stok, üretici borcu, bayi
// iadesi ve düzeltme yolları ayrı ayrı ölçülüyor.
//
// Çalıştırma:
//   createdb hal_tare_e2e && DATABASE_URL=... npx prisma db push
//   DATABASE_URL=... node tests/tare.e2e.js
import assert from 'node:assert/strict'
import { prisma } from '../src/utils/prismaClient.js'
import { createEntryBatch, createManualDepoEntry, updateEntry } from '../src/controllers/entryController.js'
import { createReturnBatch } from '../src/controllers/transferController.js'

let pass = 0, fail = 0
const ok = (c, msg, ek = '') => {
  console.log((c ? '  ✓ ' : '  ✗ ') + msg + (c || !ek ? '' : ` — ${ek}`))
  c ? pass++ : fail++
}

// Express handler'ını doğrudan çağırmak için minimal req/res.
function call(handler, body, user = { name: 'Test', role: 'ADMIN' }) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this },
      json(payload) { resolve({ status: this.statusCode, body: payload }) },
      end() { resolve({ status: this.statusCode, body: null }) },
    }
    handler({
      body, params: body.__params ?? {}, query: {}, user,
      // audit() gerçek istekten okuyor — sahte req'te de bulunmalı.
      headers: {}, ip: '127.0.0.1', get: () => undefined,
    }, res, reject)
  })
}

async function temizle() {
  // Bağımlılık sırası: önce yaprakları sil.
  await prisma.returnRecord.deleteMany()
  await prisma.caseMovement.deleteMany()
  await prisma.exitItem.deleteMany()
  await prisma.exit.deleteMany()
  await prisma.ledgerEntry.deleteMany()
  await prisma.transfer.deleteMany()
  await prisma.syncedBatch.deleteMany()
  await prisma.entry.deleteMany()
  await prisma.regionSession.deleteMany()
  await prisma.purchasePrice.deleteMany()
  await prisma.producerPrice.deleteMany()
  await prisma.price.deleteMany()
  await prisma.producer.deleteMany()
  await prisma.product.deleteMany()
  await prisma.region.deleteMany()
  await prisma.market.deleteMany()
}

const bugun = new Date()
bugun.setHours(0, 0, 0, 0)

async function kur() {
  await temizle()
  const region = await prisma.region.create({ data: { name: 'Bölge 1' } })
  const producer = await prisma.producer.create({ data: { name: 'Üretici A', regionId: region.id } })
  const domates = await prisma.product.create({ data: { name: 'Domates', unit: 'CASE' } })
  const marul = await prisma.product.create({ data: { name: 'Marul', unit: 'BUNCH' } })
  const depo = await prisma.market.create({ data: { no: 0, name: 'DEPO' } })
  const bayi = await prisma.market.create({ data: { no: 5, name: 'Bayi 5' } })
  const session = await prisma.regionSession.create({
    data: { regionId: region.id, status: 'ACTIVE' },
  })
  // Alış 10 TL/kg (üretici borcu), satış 15 TL/kg (bayi iadesi bundan hesaplanır)
  await prisma.purchasePrice.create({ data: { productId: domates.id, pricePerKg: 10, date: bugun } })
  await prisma.price.create({ data: { productId: domates.id, pricePerKg: 15, date: bugun } })
  return { region, producer, domates, marul, depo, bayi, session }
}

console.log('\n═══ KASA DARASI — uçtan uca ═══')

// ── 1. Saha mal kabul: normal kasa ──
console.log('\n── Saha mal kabul · NORMAL kasa ──')
{
  const d = await kur()
  const r = await call(createEntryBatch, {
    regionSessionId: d.session.id,
    productId: d.domates.id,
    producerId: d.producer.id,
    disposableCase: false,
    entries: [{ caseCount: 10, weight: 100, marketId: d.bayi.id }],
  })
  ok(r.status === 200 || r.status === 201, `istek kabul edildi (${r.status})`, JSON.stringify(r.body).slice(0, 120))
  const e = await prisma.entry.findFirst({ orderBy: { id: 'desc' } })
  ok(e.weight === 80, `stok NET yazıldı: 100 − 10×2 = ${e.weight} kg`)
  ok(e.grossWeight === 100, `brüt iz olarak duruyor: ${e.grossWeight}`)
  ok(e.tareKg === 20, `dara iz olarak duruyor: ${e.tareKg}`)
  ok(e.caseCount === 10, 'kasa adedi değişmedi')
  ok(e.purchaseQty === 80, `üretici döküm miktarı NET: ${e.purchaseQty}`)

  const borc = await prisma.ledgerEntry.findFirst({ where: { entryId: e.id } })
  ok(borc?.amount === 800, `üretici borcu NET üzerinden: 80 × 10 = ${borc?.amount} TL (brüt olsaydı 1000)`)
}

// ── 2. Saha mal kabul: siyah kasa ──
console.log('\n── Saha mal kabul · SİYAH kasa (dara YOK) ──')
{
  const d = await kur()
  await call(createEntryBatch, {
    regionSessionId: d.session.id,
    productId: d.domates.id,
    producerId: d.producer.id,
    disposableCase: true,
    entries: [{ caseCount: 10, weight: 100, marketId: d.bayi.id }],
  })
  const e = await prisma.entry.findFirst({ orderBy: { id: 'desc' } })
  ok(e.weight === 100, `kilo olduğu gibi: ${e.weight}`)
  ok(e.grossWeight === null && e.tareKg === null, 'dara iz kolonları boş (uygulanmadı)')
  const borc = await prisma.ledgerEntry.findFirst({ where: { entryId: e.id } })
  ok(borc?.amount === 1000, `üretici borcu brütten: ${borc?.amount} TL`)
}

// ── 3. Aynı partide satır bazlı siyah kasa ──
console.log('\n── Aynı partide karışık: bir satır siyah, biri normal ──')
{
  const d = await kur()
  await call(createEntryBatch, {
    regionSessionId: d.session.id,
    productId: d.domates.id,
    producerId: d.producer.id,
    disposableCase: false,
    entries: [
      { caseCount: 10, weight: 100, marketId: d.bayi.id, disposableCase: true },
      { caseCount: 10, weight: 100, marketId: d.bayi.id, disposableCase: false },
    ],
  })
  const rows = await prisma.entry.findMany({ orderBy: { id: 'asc' } })
  ok(rows.length === 2, 'iki satır yazıldı')
  ok(rows[0].weight === 100 && rows[0].tareKg === null, 'siyah kasalı satırda dara yok')
  ok(rows[1].weight === 80 && rows[1].tareKg === 20, 'normal kasalı satırda dara düşüldü')
}

// ── 4. Bağ ürünü ──
console.log('\n── Bağ ürünü (dara uygulanmaz) ──')
{
  const d = await kur()
  await call(createEntryBatch, {
    regionSessionId: d.session.id,
    productId: d.marul.id,
    entries: [{ caseCount: 5, weight: 30, marketId: d.bayi.id }],
  })
  const e = await prisma.entry.findFirst({ orderBy: { id: 'desc' } })
  ok(e.weight === 30, `30 bağ olduğu gibi kaldı: ${e.weight}`)
  ok(e.tareKg === null, 'bağda dara kolonu boş')
}

// ── 5. Dara brütü aşarsa reddedilmeli ──
console.log('\n── Dara brütü aşıyor → 400 ──')
{
  const d = await kur()
  const r = await call(createEntryBatch, {
    regionSessionId: d.session.id,
    productId: d.domates.id,
    entries: [{ caseCount: 10, weight: 15, marketId: d.bayi.id }],
  })
  ok(r.status === 400, `400 döndü (${r.status})`)
  ok(/dara/i.test(r.body?.error ?? ''), `hata mesajı darayı anlatıyor: "${r.body?.error}"`)
  const n = await prisma.entry.count()
  ok(n === 0, 'hiçbir satır yazılmadı')
}

// ── 6. Ofis / depo elle giriş ──
console.log('\n── Ofis elle giriş ──')
{
  const d = await kur()
  await call(createManualDepoEntry, {
    productId: d.domates.id,
    producerId: d.producer.id,
    caseCount: 8,
    weight: 50,
    disposableCase: false,
  })
  const e = await prisma.entry.findFirst({ orderBy: { id: 'desc' } })
  ok(e.weight === 34, `50 − 8×2 = ${e.weight} kg net`)
  ok(e.grossWeight === 50 && e.tareKg === 16, 'brüt/dara izi yazıldı')
  const borc = await prisma.ledgerEntry.findFirst({ where: { entryId: e.id } })
  ok(borc?.amount === 340, `borç net üzerinden: ${borc?.amount} TL`)
}

// ── 7. DÜZELTME: aynı değerlerle kaydet → dara İKİ KEZ düşmemeli ──
console.log('\n── Düzeltme · çift düşüm koruması ──')
{
  const d = await kur()
  await call(createEntryBatch, {
    regionSessionId: d.session.id,
    productId: d.domates.id,
    producerId: d.producer.id,
    entries: [{ caseCount: 10, weight: 100, marketId: d.bayi.id }],
  })
  const once = await prisma.entry.findFirst({ orderBy: { id: 'desc' } })
  // Ekran BRÜT'ü gönderiyor (RecentEntriesList grossWeight'i yüklüyor)
  await call(updateEntry, {
    __params: { id: String(once.id) },
    caseCount: 10,
    weight: once.grossWeight,
    marketId: once.marketId,
  })
  const sonra = await prisma.entry.findUnique({ where: { id: once.id } })
  ok(sonra.weight === 80, `kilo 80'de kaldı, 60'a düşmedi: ${sonra.weight}`)
  const borc = await prisma.ledgerEntry.findFirst({ where: { entryId: once.id } })
  ok(borc?.amount === 800, `borç da sabit: ${borc?.amount} TL`)
}

// ── 8. DÜZELTME: kasa adedi değişince dara da değişmeli ──
console.log('\n── Düzeltme · kasa adedi değişti ──')
{
  const d = await kur()
  await call(createEntryBatch, {
    regionSessionId: d.session.id,
    productId: d.domates.id,
    producerId: d.producer.id,
    entries: [{ caseCount: 10, weight: 100, marketId: d.bayi.id }],
  })
  const once = await prisma.entry.findFirst({ orderBy: { id: 'desc' } })
  await call(updateEntry, {
    __params: { id: String(once.id) },
    caseCount: 5, // "10 yazmışım, 5'ti"
    weight: 100,
    marketId: once.marketId,
  })
  const sonra = await prisma.entry.findUnique({ where: { id: once.id } })
  ok(sonra.weight === 90, `5 kasa → 100 − 10 = ${sonra.weight} kg`)
  ok(sonra.tareKg === 10, `dara güncellendi: ${sonra.tareKg}`)
  const borc = await prisma.ledgerEntry.findFirst({ where: { entryId: once.id } })
  ok(borc?.amount === 900, `borç senkronlandı: ${borc?.amount} TL`)
}

// ── 9. DÜZELTME: siyah kasa işaretlenince dara kalkmalı ──
console.log('\n── Düzeltme · siyah kasa işaretlendi ──')
{
  const d = await kur()
  await call(createEntryBatch, {
    regionSessionId: d.session.id,
    productId: d.domates.id,
    producerId: d.producer.id,
    entries: [{ caseCount: 10, weight: 100, marketId: d.bayi.id }],
  })
  const once = await prisma.entry.findFirst({ orderBy: { id: 'desc' } })
  await call(updateEntry, {
    __params: { id: String(once.id) },
    disposableCase: true, // kilo GÖNDERİLMİYOR — baseline grossWeight olmalı
    marketId: once.marketId,
  })
  const sonra = await prisma.entry.findUnique({ where: { id: once.id } })
  ok(sonra.weight === 100, `brüte döndü: ${sonra.weight} kg (80'de kalsaydı kilo kaybolurdu)`)
  ok(sonra.grossWeight === null && sonra.tareKg === null, 'iz kolonları temizlendi')
}

// ── 10. Bayi iadesi ──
console.log('\n── Bayi iadesi ──')
{
  const d = await kur()
  const r = await call(createReturnBatch, {
    fromMarketId: d.bayi.id,
    rows: [{ productId: d.domates.id, caseCount: 4, weight: 40, destination: 'DEPO' }],
  })
  ok(r.status < 400, `iade kabul edildi (${r.status})`, JSON.stringify(r.body).slice(0, 150))
  const rec = await prisma.returnRecord.findFirst({ orderBy: { id: 'desc' } })
  ok(rec?.weight === 32, `iade NET kaydedildi: 40 − 4×2 = ${rec?.weight} kg`)
  ok(rec?.amount === 480, `bayi alacağı net × 15 = ${rec?.amount} TL (brüt olsaydı 600)`)
  const e = await prisma.entry.findUnique({ where: { id: rec.entryId } })
  ok(e?.weight === 32 && e?.grossWeight === 40 && e?.tareKg === 8, 'iade Entry"si de net + iz taşıyor')
}

await temizle()
await prisma.$disconnect()
console.log(`\n═══ ${pass} geçti, ${fail} başarısız ═══`)
process.exit(fail ? 1 : 0)
