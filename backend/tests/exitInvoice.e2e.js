// LEGAL FATURA EŞLEŞTİRMESİ — uçtan uca. GERÇEK controller'lar, GERÇEK veritabanı.
//
// Kritik olan iki şey: (1) benzersizlik gerçekten zorlanıyor mu — aynı fatura
// numarası iki irsaliyeye yazılabilirse mutabakat imkânsız hale gelir;
// (2) sekmeler doğru bölüyor mu — onaylanan irsaliye kuyrukta kalırsa muhasebeci
// aynı işi iki kez yapar.
//
// Çalıştırma:
//   createdb hal_invoice_e2e && DATABASE_URL=... npx prisma db push
//   DATABASE_URL=... node tests/exitInvoice.e2e.js
import { prisma } from '../src/utils/prismaClient.js'
import { createExit } from '../src/controllers/exitController.js'
import {
  invoiceQueue, setInvoiceNo, clearInvoiceNo, markPrinted, setExitPrices,
} from '../src/controllers/exitInvoiceController.js'

let pass = 0, fail = 0
const ok = (c, msg, ek = '') => {
  console.log((c ? '  ✓ ' : '  ✗ ') + msg + (c || !ek ? '' : ` — ${ek}`))
  c ? pass++ : fail++
}

function call(handler, { body = {}, params = {}, query = {}, user } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this },
      json(payload) { resolve({ status: this.statusCode, body: payload }) },
      end() { resolve({ status: this.statusCode, body: null }) },
    }
    handler({
      body, params, query,
      user: user ?? { name: 'Muhasebe', username: 'muh', role: 'ACCOUNTING' },
      headers: {}, ip: '127.0.0.1',
    }, res, reject)
  })
}

async function temizle() {
  await prisma.returnRecord.deleteMany()
  await prisma.caseMovement.deleteMany()
  await prisma.exitItem.deleteMany()
  await prisma.ledgerEntry.deleteMany()
  await prisma.exit.deleteMany()
  await prisma.transfer.deleteMany()
  await prisma.entry.deleteMany()
  await prisma.exitLock.deleteMany()
  await prisma.price.deleteMany()
  await prisma.product.deleteMany()
  await prisma.market.deleteMany()
}

const bugun = new Date()
bugun.setHours(0, 0, 0, 0)

// İki bayiye birer irsaliye keser, id'lerini döner.
async function kur() {
  await temizle()
  const urun = await prisma.product.create({ data: { name: 'Domates', unit: 'CASE' } })
  await prisma.price.create({ data: { productId: urun.id, pricePerKg: 15, date: bugun } })
  const bayi1 = await prisma.market.create({ data: { no: 5, name: 'DİMA' } })
  const bayi2 = await prisma.market.create({ data: { no: 7, name: 'ONBAŞI' } })

  const fisler = []
  for (const bayi of [bayi1, bayi2]) {
    const e = await prisma.entry.create({
      data: { productId: urun.id, caseCount: 10, weight: 80, unit: 'CASE', marketId: bayi.id },
    })
    const r = await call(createExit, { body: { marketId: bayi.id, entryIds: [e.id] } })
    if (r.status >= 400) throw new Error('irsaliye kesilemedi: ' + JSON.stringify(r.body))
    fisler.push(r.body.id)
  }
  return { fisler, bayi1, bayi2, urun }
}

const kuyruk = (query, user) => call(invoiceQueue, { query, user })

// audit() ATEŞLE-UNUT: uygulama denetim yazımını beklemiyor (istek gecikmesin
// diye, kod tabanının her yerinde böyle). Test o yüzden kısa süre yoklamalı —
// tek sefer sorgulamak testi yarış durumuna sokar, koda dair bir şey söylemez.
async function auditBekle(recordId, desen, ms = 1500) {
  const bitis = Date.now() + ms
  while (Date.now() < bitis) {
    const log = await prisma.auditLog.findFirst({
      where: { resource: 'exit', recordId },
      orderBy: { id: 'desc' },
    })
    if (log && desen.test(log.detail ?? '')) return log
    await new Promise((r) => setTimeout(r, 50))
  }
  return await prisma.auditLog.findFirst({
    where: { resource: 'exit', recordId }, orderBy: { id: 'desc' },
  })
}

console.log('\n═══ FATURA ONAYI — uçtan uca ═══')

// ── 1. Kesilen her irsaliye kuyruğa düşer ──
console.log('\n── Kuyruk · yeni irsaliyeler ──')
let ctx
{
  ctx = await kur()
  const r = await kuyruk({ status: 'pending' })
  ok(r.status === 200, `istek 200 (${r.status})`)
  ok(r.body.total === 2, `2 irsaliye bekliyor: ${r.body.total}`)
  ok(r.body.pendingCount === 2, `pendingCount = ${r.body.pendingCount}`)
  const ilk = r.body.data[0]
  ok(ilk.invoiceNo === null, 'fatura no boş')
  ok(ilk.printedAt === null, 'baskı işareti boş')
  ok(ilk.amount === 1200, `tutar hesaplandı: 80 kg × 15 = ${ilk.amount} TL`)
  ok(ilk.trackedCases === 10, `kasa: ${ilk.trackedCases}`)
  const onayli = await kuyruk({ status: 'approved' })
  ok(onayli.body.total === 0, 'onaylılar sekmesi boş')
}

// ── 2. Onay ──
console.log('\n── Onay ──')
{
  const r = await call(setInvoiceNo, { params: { id: String(ctx.fisler[0]) }, body: { invoiceNo: 'MSK2026-001' } })
  ok(r.status === 200, `onay 200 (${r.status})`, JSON.stringify(r.body).slice(0, 120))
  ok(r.body.invoiceNo === 'MSK2026-001', `fatura no yazıldı: ${r.body.invoiceNo}`)
  ok(!!r.body.invoiceAt, 'onay zamanı yazıldı')
  ok(r.body.invoiceBy === 'Muhasebe', `onaylayan: ${r.body.invoiceBy}`)

  const bekleyen = await kuyruk({ status: 'pending' })
  ok(bekleyen.body.total === 1, `bekleyen 1'e düştü: ${bekleyen.body.total}`)
  const onayli = await kuyruk({ status: 'approved' })
  ok(onayli.body.total === 1, `onaylı 1 oldu: ${onayli.body.total}`)
  ok(onayli.body.pendingCount === 1, 'pendingCount her iki sekmede de doğru')

  const log = await auditBekle(ctx.fisler[0], /MSK2026-001/)
  ok(/MSK2026-001/.test(log?.detail ?? ''), `denetim kaydı düştü: ${log?.detail}`)
}

// ── 3. BENZERSİZLİK ──
console.log('\n── Benzersizlik ──')
{
  const r = await call(setInvoiceNo, { params: { id: String(ctx.fisler[1]) }, body: { invoiceNo: 'MSK2026-001' } })
  ok(r.status === 409, `aynı numara reddedildi (${r.status})`)
  ok(/#\d+/.test(r.body?.error ?? ''), `hata hangi irsaliye olduğunu söylüyor: "${r.body?.error}"`)

  // Harf farkı: DB'deki unique index harfe DUYARLI, uygulama katmanı yakalamalı.
  const r2 = await call(setInvoiceNo, { params: { id: String(ctx.fisler[1]) }, body: { invoiceNo: 'msk2026-001' } })
  ok(r2.status === 409, `büyük/küçük harf farkı da reddedildi (${r2.status})`)

  // Boşluk farkı normalize edilir
  const r3 = await call(setInvoiceNo, { params: { id: String(ctx.fisler[1]) }, body: { invoiceNo: '  MSK2026-001  ' } })
  ok(r3.status === 409, `baş/son boşluk normalize edildi, yine çakıştı (${r3.status})`)

  const r4 = await call(setInvoiceNo, { params: { id: String(ctx.fisler[1]) }, body: { invoiceNo: 'MSK2026-002' } })
  ok(r4.status === 200, 'farklı numara kabul edildi')
}

// ── 4. Boş / geçersiz numara ──
console.log('\n── Geçersiz giriş ──')
{
  const bos = await call(setInvoiceNo, { params: { id: String(ctx.fisler[0]) }, body: { invoiceNo: '   ' } })
  ok(bos.status === 400, `yalnız boşluktan oluşan numara reddedildi (${bos.status})`)
  const uzun = await call(setInvoiceNo, { params: { id: String(ctx.fisler[0]) }, body: { invoiceNo: 'X'.repeat(65) } })
  ok(uzun.status === 400, `65 karakter reddedildi (${uzun.status})`)
  const yok = await call(setInvoiceNo, { params: { id: '999999' }, body: { invoiceNo: 'A-1' } })
  ok(yok.status === 404, `olmayan irsaliye 404 (${yok.status})`)
  // Numara hâlâ ilk hâlinde mi?
  const ex = await prisma.exit.findUnique({ where: { id: ctx.fisler[0] } })
  ok(ex.invoiceNo === 'MSK2026-001', 'geçersiz denemeler mevcut numarayı bozmadı')
}

// ── 5. Düzeltme ──
console.log('\n── Düzeltme ──')
{
  const r = await call(setInvoiceNo, { params: { id: String(ctx.fisler[0]) }, body: { invoiceNo: 'MSK2026-009' } })
  ok(r.status === 200 && r.body.invoiceNo === 'MSK2026-009', 'aynı irsaliyenin numarası düzeltilebiliyor')
  const log = await auditBekle(ctx.fisler[0], /MSK2026-001.*MSK2026-009/)
  ok(/MSK2026-001.*MSK2026-009/.test(log?.detail ?? ''), `denetimde eski→yeni var: ${log?.detail}`)
  // Serbest bırakılan eski numara tekrar kullanılabilmeli
  const r2 = await call(setInvoiceNo, { params: { id: String(ctx.fisler[1]) }, body: { invoiceNo: 'MSK2026-001' } })
  ok(r2.status === 200, 'boşalan numara başka irsaliyeye yazılabildi')
}

// ── 6. Onayı geri alma ──
console.log('\n── Onayı geri alma ──')
{
  const r = await call(clearInvoiceNo, {
    params: { id: String(ctx.fisler[0]) },
    user: { name: 'Patron', role: 'ADMIN' },
  })
  ok(r.status === 200, `geri alındı (${r.status})`)
  ok(r.body.invoiceNo === null && r.body.invoiceAt === null, 'fatura alanları temizlendi')
  const bekleyen = await kuyruk({ status: 'pending' })
  ok(bekleyen.body.data.some((e) => e.id === ctx.fisler[0]), 'bekleyenlere geri döndü')
  const tekrar = await call(clearInvoiceNo, { params: { id: String(ctx.fisler[0]) }, user: { role: 'ADMIN' } })
  ok(tekrar.status === 400, `zaten onaysız olanı geri alma 400 (${tekrar.status})`)
}

// ── 7. Baskı işareti ──
console.log('\n── Baskı işareti ──')
{
  const id = ctx.fisler[0]
  const r1 = await call(markPrinted, { params: { id: String(id) }, user: { name: 'Operatör', role: 'OPERATOR' } })
  ok(r1.status === 200 && !!r1.body.printedAt, 'ilk baskı işaretlendi')
  ok(r1.body.printCount === 1, `printCount = ${r1.body.printCount}`)
  ok(r1.body.printedBy === 'Operatör', `basan: ${r1.body.printedBy}`)

  const ilkAn = r1.body.printedAt
  const r2 = await call(markPrinted, { params: { id: String(id) }, user: { name: 'Muhasebe', role: 'ACCOUNTING' } })
  ok(r2.body.printCount === 2, `ikinci baskı sayacı artırdı: ${r2.body.printCount}`)
  ok(String(r2.body.printedAt) === String(ilkAn), 'İLK baskı anı sabit kaldı')
  ok(r2.body.printedBy === 'Operatör', 'ilk basan kişi korundu')

  const kuy = await kuyruk({ status: 'pending' })
  const satir = kuy.body.data.find((e) => e.id === id)
  ok(!!satir?.printedAt && satir.printCount === 2, 'kuyruk satırı baskı bilgisini taşıyor')
  ok(satir.invoiceNo === null, 'BASKI, onay durumunu DEĞİŞTİRMEDİ (kuyruk baskıya bağlı değil)')
}

// ── 8. Arama ──
console.log('\n── Arama ──')
{
  const idIle = await kuyruk({ status: 'approved', q: String(ctx.fisler[1]) })
  ok(idIle.body.data.some((e) => e.id === ctx.fisler[1]), 'fiş no ile bulundu')
  const pazarIle = await kuyruk({ status: 'approved', q: 'ONBAŞI' })
  ok(pazarIle.body.data.length === 1, `pazar adıyla bulundu: ${pazarIle.body.data.length}`)
  const faturaIle = await kuyruk({ status: 'approved', q: 'msk2026-001' })
  ok(faturaIle.body.data.length === 1, 'fatura no ile bulundu (harf duyarsız)')
  const yok = await kuyruk({ status: 'approved', q: 'ZZZZ' })
  ok(yok.body.total === 0, 'eşleşmeyen arama boş döndü')
  const gecersiz = await kuyruk({ status: 'saçma' })
  ok(gecersiz.status === 400, `geçersiz sekme 400 (${gecersiz.status})`)
}

// ── 9. ESKİ FİŞ: snapshot yok ama fiyat tablosunda var ──
//
// GERÇEK HATA (2026-08-27, canlıda #1 nolu fiş): ExitItem.pricePerKg alanı
// sonradan eklendi, öncesindeki irsaliyelerin kalemlerinde NULL duruyor. Onay
// ekranı yalnız snapshot'a bakınca "fiyat yok · 0,00 TL" diyordu; AYNI fiş
// yazdırıldığında ise fiyatlı basılıyordu (historyController fiyat tablosuna
// geri düşüyor). Muhasebeci iki ekranda iki farklı gerçek görüyordu.
console.log('\n── Eski fiş · fiyat snapshot"u yok ──')
{
  const d = await kur()
  // Snapshot'ları sil → dara/indirim öncesi eski kayıtları taklit et
  await prisma.exitItem.updateMany({ data: { pricePerKg: null, listPricePerKg: null } })

  const r = await kuyruk({ status: 'pending' })
  const satir = r.body.data.find((e) => e.id === d.fisler[0])
  ok(satir.missingPrices === 0, `"fiyat yok" DEMİYOR: missingPrices = ${satir.missingPrices}`)
  ok(satir.amount === 1200, `tutar fiyat tablosundan hesaplandı: ${satir.amount} TL (0 değil)`)

  // Fiyat tablosunda da yoksa GERÇEKTEN fiyat yok demeli — geri düşüş
  // uyarıyı tamamen susturmamalı.
  await prisma.price.deleteMany()
  const r2 = await kuyruk({ status: 'pending' })
  const satir2 = r2.body.data.find((e) => e.id === d.fisler[0])
  ok(satir2.missingPrices === 1, `fiyat gerçekten yoksa uyarı duruyor: ${satir2.missingPrices}`)
  ok(satir2.amount === 0, `tutar 0: ${satir2.amount}`)
}

// ── 10. Fiyatsız kalemler onay ekranında SORULABİLİR olmalı ──
console.log('\n── Fiyatsız ürünler onay ekranına taşınıyor ──')
{
  const d = await kur()
  await prisma.exitItem.updateMany({ data: { pricePerKg: null, listPricePerKg: null } })
  await prisma.price.deleteMany()

  const r = await kuyruk({ status: 'pending' })
  const satir = r.body.data.find((e) => e.id === d.fisler[0])
  ok(satir.missingPrices === 1, `fiyatsız kalem sayısı: ${satir.missingPrices}`)
  ok(Array.isArray(satir.products), 'ürün listesi dönüyor')
  ok(satir.products.length === 1, `1 ürün: ${satir.products.length}`)
  ok(satir.products[0].name === 'Domates', `ürün ADIYLA geliyor: ${satir.products[0].name}`)
  ok(satir.products[0].unit === 'CASE', `birim geliyor: ${satir.products[0].unit}`)
  ok(typeof satir.products[0].productId === 'number', 'productId geliyor')
  ok(satir.products[0].pricePerKg === null, 'fiyatsızda pricePerKg null')

  // Fiyatı olan fişte liste BOŞ olmalı — ekran gereksiz alan açmasın
  await prisma.price.create({ data: { productId: d.urun.id, pricePerKg: 15, date: bugun } })
  const r2 = await kuyruk({ status: 'pending' })
  const satir2 = r2.body.data.find((e) => e.id === d.fisler[0])
  // Liste BOŞALMAZ — artık tüm ürünler dönüyor ki onaylanmış fişin fiyatı da
  // düzeltilebilsin. Değişen tek şey: pricePerKg artık dolu, uyarı düştü.
  ok(satir2.products.length === 1, 'ürün listesi duruyor (fiyat düzeltilebilsin)')
  ok(satir2.products[0].pricePerKg === 15, `geçerli fiyat dönüyor: ${satir2.products[0].pricePerKg}`)
  ok(satir2.missingPrices === 0, 'fiyat uyarısı düştü')
  ok(satir2.amount === 1200, `tutar hesaplandı: ${satir2.amount} TL`)
}

// ── 11. Aynı ürünün birden fazla kalemi TEK KEZ sorulmalı ──
console.log('\n── Aynı ürün tekilleştirme ──')
{
  await temizle()
  const urun = await prisma.product.create({ data: { name: 'Biber', unit: 'CASE' } })
  const bayi = await prisma.market.create({ data: { no: 9, name: 'Bayi 9' } })
  const ids = []
  for (let i = 0; i < 3; i++) {
    const e = await prisma.entry.create({
      data: { productId: urun.id, caseCount: 1, weight: 10, unit: 'CASE', marketId: bayi.id },
    })
    ids.push(e.id)
  }
  const r = await call(createExit, { body: { marketId: bayi.id, entryIds: ids } })
  await prisma.exitItem.updateMany({ data: { pricePerKg: null } })
  const kuy = await kuyruk({ status: 'pending' })
  const satir = kuy.body.data.find((e) => e.id === r.body.id)
  ok(satir.missingPrices === 3, `3 kalem fiyatsız: ${satir.missingPrices}`)
  ok(satir.products.length === 1, `ama TEK ürün soruluyor: ${satir.products.length}`)
}

// ── 11b. ONAYLANMIŞ fişin fiyatı da düzeltilebilmeli ──
console.log('\n── Onaylı fişte fiyat düzeltme ──')
{
  const d = await kur()
  const id = d.fisler[0]
  await call(setInvoiceNo, { params: { id: String(id) }, body: { invoiceNo: 'DZL-1' } })

  const onayli = await kuyruk({ status: 'approved' })
  const satir = onayli.body.data.find((e) => e.id === id)
  ok(satir.products.length === 1, 'onaylı satırda da ürün listesi var')
  ok(satir.products[0].pricePerKg === 15, `mevcut fiyat kutuya dolacak: ${satir.products[0].pricePerKg}`)
  ok(satir.amount === 1200, `onay anındaki tutar: ${satir.amount} TL`)

  const borcOnce = await prisma.ledgerEntry.findUnique({ where: { exitId: id } })
  ok(borcOnce?.amount === 1200, `bayi borcu önce: ${borcOnce?.amount} TL`)

  // Fiyat 15 → 20 (ekranın çağırdığı ucun aynısı)
  const dz = await call(setExitPrices, {
    params: { id: String(id) },
    body: { prices: [{ productId: d.urun.id, pricePerKg: 20 }] },
  })
  ok(dz.status === 200, `düzeltme 200 (${dz.status})`, JSON.stringify(dz.body).slice(0, 120))
  ok(dz.body.products[0].pricePerKg === 20, `yanıtta yeni fiyat: ${dz.body.products[0].pricePerKg}`)
  ok(dz.body.amount === 1600, `yanıtta yeni tutar: ${dz.body.amount} TL`)

  // (1) Kalem SNAPSHOT'ı gerçekten değişti mi — asıl tuzak buydu: yalnız Price
  // yazılsaydı ekran "kaydedildi" der, fişin tutarı hiç değişmezdi.
  const kalem = await prisma.exitItem.findFirst({ where: { exitId: id } })
  ok(kalem.pricePerKg === 20, `kalem snapshot'ı güncellendi: ${kalem.pricePerKg}`)
  // (2) Günün fiyat tablosu.
  // findFirst DEĞİL, EN GÜNCEL TARİHLİ satır: fiyat carry-forward'lı (bkz.
  // priceController.effectivePriceRows) ve fişin gününe satır yoksa yenisi
  // AÇILIYOR, eskisi ezilmiyor. İlk satıra bakmak eski rakamı görür.
  const gunFiyat = await prisma.price.findFirst({
    where: { productId: d.urun.id }, orderBy: { date: 'desc' },
  })
  ok(gunFiyat.pricePerKg === 20, `fişin gününe geçerli fiyat yazıldı: ${gunFiyat.pricePerKg}`)
  // (3) Bayi borcu — fiş ile cari ayrışmamalı
  const borcSonra = await prisma.ledgerEntry.findUnique({ where: { exitId: id } })
  ok(borcSonra?.amount === 1600, `bayi borcu senkronlandı: ${borcSonra?.amount} TL`)

  const sonra = await kuyruk({ status: 'approved' })
  const satir2 = sonra.body.data.find((e) => e.id === id)
  ok(satir2.amount === 1600, `listede yeni tutar: ${satir2.amount} TL`)
  ok(satir2.invoiceNo === 'DZL-1', 'fatura no bozulmadı')

  const bosluk = await call(setExitPrices, { params: { id: String(id) }, body: { prices: [] } })
  ok(bosluk.status === 400, `boş fiyat listesi 400 (${bosluk.status})`)
  const sifir = await call(setExitPrices, {
    params: { id: String(id) }, body: { prices: [{ productId: d.urun.id, pricePerKg: 0 }] },
  })
  ok(sifir.status === 400, `sıfır fiyat reddedildi (${sifir.status})`)
  const hala = await prisma.exitItem.findFirst({ where: { exitId: id } })
  ok(hala.pricePerKg === 20, 'geçersiz denemeler fiyatı bozmadı')
}

// ── 12. Sayfalama ──
console.log('\n── Sayfalama ──')
{
  await temizle()
  const urun = await prisma.product.create({ data: { name: 'Biber', unit: 'CASE' } })
  await prisma.price.create({ data: { productId: urun.id, pricePerKg: 10, date: bugun } })
  const bayi = await prisma.market.create({ data: { no: 3, name: 'Bayi 3' } })
  for (let i = 0; i < 12; i++) {
    const e = await prisma.entry.create({
      data: { productId: urun.id, caseCount: 1, weight: 10, unit: 'CASE', marketId: bayi.id },
    })
    await call(createExit, { body: { marketId: bayi.id, entryIds: [e.id] } })
  }
  const s1 = await kuyruk({ status: 'pending', page: '1', limit: '10' })
  ok(s1.body.total === 12 && s1.body.data.length === 10, `sayfa 1: ${s1.body.data.length}/${s1.body.total}`)
  ok(s1.body.hasMore === true, 'hasMore true')
  const s2 = await kuyruk({ status: 'pending', page: '2', limit: '10' })
  ok(s2.body.data.length === 2 && s2.body.hasMore === false, 'sayfa 2: kalan 2 kayıt')
  // Bekleyenler ESKİDEN YENİYE — en uzun bekleyen en tepede
  ok(s1.body.data[0].id < s1.body.data[9].id, 'bekleyenler eskiden yeniye sıralı')
}

await temizle()
await prisma.$disconnect()
console.log(`\n═══ ${pass} geçti, ${fail} başarısız ═══`)
process.exit(fail ? 1 : 0)
