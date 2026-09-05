// TRANSFER GEÇMİŞİ → PAZAR / ÜRÜN FİLTRESİ — uçtan uca. GERÇEK controller, GERÇEK veritabanı.
//
// Kanıtladığı şey: Transfer Geçmişi ekranındaki "Pazar" filtresi transferin
// KAYNAK ve HEDEF tarafını birden tarıyor, "Ürün" filtresi de kalemin ürününe
// iniyor. İkisi birlikte seçilince kesişim dönüyor.
//
// NEDEN GEREKLİ: her transferin iki pazarı var. Filtre tek tarafa bakarsa
// "5 no'lu pazarla ilgili ne oldu" sorusu yarım cevap veriyor — mal oraya mı
// geldi oradan mı gitti, kullanıcı aramaya başlamadan bilmiyor.
//
// Çalıştırma:
//   createdb hal_transfer_e2e
//   DATABASE_URL=postgresql://localhost/hal_transfer_e2e npx prisma db push
//   DATABASE_URL=postgresql://localhost/hal_transfer_e2e node tests/transferFilters.e2e.js
import { prisma } from '../src/utils/prismaClient.js'
import { listTransfers } from '../src/controllers/transferController.js'

let pass = 0, fail = 0
const ok = (c, msg, ek = '') => {
  console.log((c ? '  ✓ ' : '  ✗ ') + msg + (c || !ek ? '' : ` — ${ek}`))
  c ? pass++ : fail++
}

function call(handler, { query = {} } = {}, user = { name: 'Test', role: 'ADMIN' }) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this },
      json(payload) { resolve({ status: this.statusCode, body: payload }) },
      end() { resolve({ status: this.statusCode, body: null }) },
    }
    handler({ query, body: {}, params: {}, user, headers: {}, ip: '127.0.0.1', get: () => undefined }, res, reject)
  })
}

async function temizle() {
  await prisma.transfer.deleteMany()
  await prisma.entry.deleteMany()
  await prisma.regionSession.deleteMany()
  await prisma.producer.deleteMany()
  await prisma.product.deleteMany()
  await prisma.region.deleteMany()
  await prisma.market.deleteMany()
}

async function kur() {
  await temizle()
  const region = await prisma.region.create({ data: { name: 'Bölge 1' } })
  const producer = await prisma.producer.create({ data: { name: 'Üretici A', regionId: region.id } })
  const domates = await prisma.product.create({ data: { name: 'Domates', unit: 'CASE' } })
  const biber = await prisma.product.create({ data: { name: 'Biber', unit: 'CASE' } })
  const depo = await prisma.market.create({ data: { no: 0, name: 'DEPO' } })
  const bayi5 = await prisma.market.create({ data: { no: 5, name: 'Bayi 5' } })
  const bayi6 = await prisma.market.create({ data: { no: 6, name: 'Bayi 6' } })
  const session = await prisma.regionSession.create({ data: { regionId: region.id, status: 'ACTIVE' } })

  // entry + transfer ikilisi: transfer satırının ürünü entry üzerinden okunuyor
  const mk = async (product, marketId) => prisma.entry.create({
    data: {
      productId: product.id, producerId: producer.id, regionSessionId: session.id,
      marketId, caseCount: 5, weight: 50, unit: 'CASE',
    },
  })
  const tr = async (entry, fromId, toId) => prisma.transfer.create({
    data: { entryId: entry.id, fromMarketId: fromId, toMarketId: toId, createdBy: 'Test' },
  })

  return {
    domates, biber, depo, bayi5, bayi6,
    // DEPO → Bayi 5, domates
    t1: await tr(await mk(domates, bayi5.id), depo.id, bayi5.id),
    // Bayi 5 → DEPO, biber  (bayi5 bu kez KAYNAK tarafta)
    t2: await tr(await mk(biber, depo.id), bayi5.id, depo.id),
    // DEPO → Bayi 6, domates (bayi5 hiç yok)
    t3: await tr(await mk(domates, bayi6.id), depo.id, bayi6.id),
  }
}

const ids = (r) => (r.body?.data ?? []).map((t) => t.id).sort((a, b) => a - b)
const esit = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

console.log('\n═══ TRANSFER GEÇMİŞİ · PAZAR + ÜRÜN FİLTRESİ — uçtan uca ═══')

const d = await kur()
const sirala = (arr) => arr.map((t) => t.id).sort((a, b) => a - b)

console.log('\n── Filtresiz ──')
{
  const r = await call(listTransfers)
  ok(esit(ids(r), sirala([d.t1, d.t2, d.t3])), `3 transferin hepsi geliyor`, JSON.stringify(ids(r)))
  ok(r.body?.total === 3, `total=3 (gelen: ${r.body?.total})`)
}

console.log('\n── Pazar filtresi · Bayi 5 (asıl istek: iki taraf da taransın) ──')
{
  const r = await call(listTransfers, { query: { marketId: String(d.bayi5.id) } })
  ok(esit(ids(r), sirala([d.t1, d.t2])), 'hedefi Bayi 5 olan VE kaynağı Bayi 5 olan birlikte geliyor', JSON.stringify(ids(r)))
  ok(!ids(r).includes(d.t3.id), 'Bayi 6 transferi listede yok')
  ok(r.body?.total === 2, `total=2 (gelen: ${r.body?.total})`)
}

console.log('\n── Ürün filtresi · Domates ──')
{
  const r = await call(listTransfers, { query: { productId: String(d.domates.id) } })
  ok(esit(ids(r), sirala([d.t1, d.t3])), 'sadece domates transferleri', JSON.stringify(ids(r)))
  ok(!ids(r).includes(d.t2.id), 'biber transferi listede yok')
}

console.log('\n── İkisi birlikte · Bayi 5 + Domates (kesişim) ──')
{
  const r = await call(listTransfers, { query: { marketId: String(d.bayi5.id), productId: String(d.domates.id) } })
  ok(esit(ids(r), sirala([d.t1])), 'tek satır: DEPO → Bayi 5 domates', JSON.stringify(ids(r)))
}

console.log('\n── Bayi 5 + Biber: kaynak taraftaki eşleşme kaybolmamalı ──')
{
  const r = await call(listTransfers, { query: { marketId: String(d.bayi5.id), productId: String(d.biber.id) } })
  ok(esit(ids(r), sirala([d.t2])), 'Bayi 5 → DEPO biber transferi bulundu', JSON.stringify(ids(r)))
}

console.log('\n── Çöp girdi: filtre sessizce düşer, 500 atmaz ──')
{
  const r = await call(listTransfers, { query: { marketId: 'abc', productId: '' } })
  ok(r.status === 200, `status 200 (gelen: ${r.status})`)
  ok(esit(ids(r), sirala([d.t1, d.t2, d.t3])), 'geçersiz id filtre uygulanmadan tüm liste döndü', JSON.stringify(ids(r)))
}

console.log('\n── Tarih filtresiyle birlikte çalışıyor ──')
{
  const yarin = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const r = await call(listTransfers, { query: { marketId: String(d.bayi5.id), dateFrom: yarin } })
  ok(ids(r).length === 0, `yarından itibaren 0 kayıt (gelen: ${ids(r).length})`)
}

await temizle()
await prisma.$disconnect()
console.log(`\n═══ ${pass} geçti, ${fail} kaldı ═══\n`)
process.exit(fail ? 1 : 0)
