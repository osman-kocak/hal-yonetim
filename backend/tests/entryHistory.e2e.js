// TAKİP & GEÇMİŞ → GİRİŞ KAYITLARI — uçtan uca. GERÇEK controller, GERÇEK veritabanı.
//
// Kanıtladığı şey: bayiden gelen iade bu listede GÖRÜNÜYOR ve iadeyi VEREN
// bayiden bulunabiliyor.
//
// NEDEN GEREKLİ: iade kaydı Entry.marketId'ye HEDEFİ yazıyor (Depo ya da
// yönlendirilen bayi), iadeyi veren bayiyi değil. Pazar filtresi tek tarafa
// bakarken "6 no'lu bayiden ne döndü" sorusu boş liste dönüyordu — iade
// ekranda hiç yoktu.
//
// Çalıştırma:
//   createdb hal_history_e2e
//   DATABASE_URL=postgresql://localhost/hal_history_e2e npx prisma db push
//   DATABASE_URL=postgresql://localhost/hal_history_e2e node tests/entryHistory.e2e.js
import { prisma } from '../src/utils/prismaClient.js'
import { createEntryBatch } from '../src/controllers/entryController.js'
import { createReturnBatch } from '../src/controllers/transferController.js'
import { getEntryHistory } from '../src/controllers/historyController.js'

let pass = 0, fail = 0
const ok = (c, msg, ek = '') => {
  console.log((c ? '  ✓ ' : '  ✗ ') + msg + (c || !ek ? '' : ` — ${ek}`))
  c ? pass++ : fail++
}

// Express handler'ını doğrudan çağırmak için minimal req/res.
// tare.e2e.js'teki ikizinden tek farkı: query da geçilebiliyor — bu dosyanın
// ölçtüğü şey zaten filtreler.
function call(handler, { body = {}, query = {} } = {}, user = { name: 'Test', role: 'ADMIN' }) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this },
      json(payload) { resolve({ status: this.statusCode, body: payload }) },
      end() { resolve({ status: this.statusCode, body: null }) },
    }
    handler({
      body, query, params: body.__params ?? {}, user,
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
  const depo = await prisma.market.create({ data: { no: 0, name: 'DEPO' } })
  const atilan = await prisma.market.create({ data: { no: 99, name: 'ATILAN' } })
  const bayi5 = await prisma.market.create({ data: { no: 5, name: 'Bayi 5' } })
  const bayi6 = await prisma.market.create({ data: { no: 6, name: 'Bayi 6' } })
  const session = await prisma.regionSession.create({ data: { regionId: region.id, status: 'ACTIVE' } })
  await prisma.purchasePrice.create({ data: { productId: domates.id, pricePerKg: 10, date: bugun } })
  await prisma.price.create({ data: { productId: domates.id, pricePerKg: 15, date: bugun } })
  return { region, producer, domates, depo, atilan, bayi5, bayi6, session }
}

const satirlar = (r) => r.body?.data ?? []
const bul = (r, id) => satirlar(r).find((e) => e.id === id)

console.log('\n═══ GİRİŞ GEÇMİŞİ · İADE GÖRÜNÜRLÜĞÜ — uçtan uca ═══')

// ── 1. Depoya iade: listede görünür, iadeyi veren bayi okunur ──
console.log('\n── Bayi 5 → DEPO iadesi ──')
{
  const d = await kur()
  await call(createEntryBatch, {
    body: {
      regionSessionId: d.session.id,
      productId: d.domates.id,
      producerId: d.producer.id,
      entries: [{ caseCount: 10, weight: 100, marketId: d.bayi5.id }],
    },
  })
  const malKabul = await prisma.entry.findFirst({ orderBy: { id: 'desc' } })

  const r = await call(createReturnBatch, {
    body: {
      fromMarketId: d.bayi5.id,
      rows: [{ productId: d.domates.id, caseCount: 4, weight: 40, destination: 'DEPO' }],
    },
  })
  ok(r.status === 201, `iade kaydedildi (${r.status})`, JSON.stringify(r.body).slice(0, 160))
  const iadeEntry = r.body.returns[0].entry

  const hist = await call(getEntryHistory)
  const satir = bul(hist, iadeEntry.id)
  ok(!!satir, 'iade satırı giriş geçmişinde var')
  ok(satir?.source === 'RETURN', `kaynak RETURN olarak işaretli: ${satir?.source}`)
  ok(satir?.market?.no === 0, `Pazar kolonu HEDEFİ gösteriyor (Depo): #${satir?.market?.no}`)
  ok(satir?.returnedFrom?.no === 5, `İade Eden kolonu VEREN bayiyi gösteriyor: #${satir?.returnedFrom?.no}`)

  const mk = bul(hist, malKabul.id)
  ok(mk?.source === 'HARVEST' && mk?.returnedFrom === null, 'mal kabul satırında İade Eden boş')
}

// ── 2. Pazar filtresi: iadeyi VEREN bayiden bulunabilmeli (asıl şikâyet) ──
console.log('\n── Pazar filtresi · "Bayi 5’ten ne döndü?" ──')
{
  const d = await kur()
  await call(createEntryBatch, {
    body: {
      regionSessionId: d.session.id,
      productId: d.domates.id,
      producerId: d.producer.id,
      entries: [{ caseCount: 10, weight: 100, marketId: d.bayi5.id }],
    },
  })
  const r = await call(createReturnBatch, {
    body: {
      fromMarketId: d.bayi5.id,
      rows: [{ productId: d.domates.id, caseCount: 4, weight: 40, destination: 'DEPO' }],
    },
  })
  const iadeId = r.body.returns[0].entry.id

  const bayi5Filtre = await call(getEntryHistory, { query: { marketId: String(d.bayi5.id) } })
  ok(!!bul(bayi5Filtre, iadeId), 'Bayi 5 filtresinde iade ÇIKIYOR (Entry.marketId Depo olmasına rağmen)')
  ok(bayi5Filtre.body.total === 2, `Bayi 5 filtresi: mal kabul + iade = ${bayi5Filtre.body.total} kayıt`)

  const bayi6Filtre = await call(getEntryHistory, { query: { marketId: String(d.bayi6.id) } })
  ok(bayi6Filtre.body.total === 0, `alakasız bayi filtresi boş: ${bayi6Filtre.body.total} kayıt`)

  const depoFiltre = await call(getEntryHistory, { query: { marketId: String(d.depo.id) } })
  ok(depoFiltre.body.total === 1 && !!bul(depoFiltre, iadeId), 'Depo filtresi de aynı iadeyi buluyor (mal fiilen orada)')
}

// ── 3. Kaynak filtresi ──
console.log('\n── Kaynak filtresi · mal kabul / iade / imha ──')
{
  const d = await kur()
  await call(createEntryBatch, {
    body: {
      regionSessionId: d.session.id,
      productId: d.domates.id,
      producerId: d.producer.id,
      entries: [{ caseCount: 10, weight: 100, marketId: d.bayi5.id }],
    },
  })
  await call(createReturnBatch, {
    body: {
      fromMarketId: d.bayi5.id,
      rows: [
        { productId: d.domates.id, caseCount: 2, weight: 20, destination: 'DEPO' },
        { productId: d.domates.id, caseCount: 1, weight: 10, destination: 'DISCARD' },
      ],
    },
  })

  const hepsi = await call(getEntryHistory)
  ok(hepsi.body.total === 3, `filtresiz: 1 mal kabul + 2 iade satırı = ${hepsi.body.total}`)

  const sadeceIade = await call(getEntryHistory, { query: { source: 'RETURN' } })
  ok(sadeceIade.body.total === 1 && satirlar(sadeceIade).every((e) => e.source === 'RETURN'),
    `sadece iade: ${sadeceIade.body.total} kayıt`)

  const sadeceImha = await call(getEntryHistory, { query: { source: 'DISCARD' } })
  ok(sadeceImha.body.total === 1, `sadece imha: ${sadeceImha.body.total} kayıt`)
  ok(satirlar(sadeceImha)[0]?.returnedFrom?.no === 5, 'imha satırı da iadeyi veren bayiyi taşıyor')

  const malKabul = await call(getEntryHistory, { query: { source: 'HARVEST' } })
  ok(malKabul.body.total === 1, `sadece mal kabul: ${malKabul.body.total} kayıt`)

  // Enum dışı değer sorguyu patlatmamalı, sessizce yok sayılmalı
  const saçma = await call(getEntryHistory, { query: { source: 'YOKBÖYLE' } })
  ok(saçma.status === 200 && saçma.body.total === 3, `geçersiz kaynak yok sayıldı (${saçma.status})`)
}

// ── 4. Başka bayiye yönlendirilen iade ──
console.log('\n── Bayi 5 → Bayi 6 yönlendirmesi ──')
{
  const d = await kur()
  await call(createEntryBatch, {
    body: {
      regionSessionId: d.session.id,
      productId: d.domates.id,
      producerId: d.producer.id,
      entries: [{ caseCount: 10, weight: 100, marketId: d.bayi5.id }],
    },
  })
  const r = await call(createReturnBatch, {
    body: {
      fromMarketId: d.bayi5.id,
      rows: [{ productId: d.domates.id, caseCount: 3, weight: 30, destination: 'MARKET', toMarketId: d.bayi6.id }],
    },
  })
  const iadeId = r.body.returns[0].entry.id

  const hist = await call(getEntryHistory)
  const satir = bul(hist, iadeId)
  ok(satir?.market?.no === 6, `Pazar kolonu yeni sahibi: #${satir?.market?.no}`)
  ok(satir?.returnedFrom?.no === 5, `İade Eden hâlâ Bayi 5: #${satir?.returnedFrom?.no}`)

  const b5 = await call(getEntryHistory, { query: { marketId: String(d.bayi5.id) } })
  ok(!!bul(b5, iadeId), 'Bayi 5 filtresi yönlendirilmiş iadeyi de buluyor')
  const b6 = await call(getEntryHistory, { query: { marketId: String(d.bayi6.id) } })
  ok(!!bul(b6, iadeId), 'Bayi 6 filtresi de buluyor (mal şimdi orada)')
}

// ── 5. Filtreler birlikte ──
console.log('\n── Pazar + kaynak birlikte ──')
{
  const d = await kur()
  await call(createEntryBatch, {
    body: {
      regionSessionId: d.session.id,
      productId: d.domates.id,
      producerId: d.producer.id,
      entries: [{ caseCount: 10, weight: 100, marketId: d.bayi5.id }],
    },
  })
  await call(createReturnBatch, {
    body: {
      fromMarketId: d.bayi5.id,
      rows: [{ productId: d.domates.id, caseCount: 2, weight: 20, destination: 'DEPO' }],
    },
  })

  const r = await call(getEntryHistory, { query: { marketId: String(d.bayi5.id), source: 'RETURN' } })
  ok(r.body.total === 1 && satirlar(r)[0].source === 'RETURN', `Bayi 5 + sadece iade = ${r.body.total} kayıt`)

  // Bölge filtresi iadeyi ELEMELİ: iade kaydının bölge oturumu yok.
  // Bu bir hata değil, listede beklenen davranış — kaynak filtresi bu yüzden var.
  const bolge = await call(getEntryHistory, { query: { regionId: String(d.region.id) } })
  ok(bolge.body.total === 1 && satirlar(bolge)[0].source === 'HARVEST',
    `bölge filtresi yalnız mal kabulü getiriyor: ${bolge.body.total} kayıt`)
}

console.log(`\n═══ ${pass} geçti · ${fail} kaldı ═══\n`)
await prisma.$disconnect()
process.exit(fail ? 1 : 0)
