// RENDER SMOKE TEST — sayfaları gerçekten React ile render eder.
//
// NEDEN VAR: `EmptyState icon={Users}` (lucide component'i, emoji beklenen yere)
// canlıda "Minified React error #31" ile TÜM SAYFAYI çökertti. Ne `vite build`
// ne eslint bunu yakaladı — ikisi de JSX'i çalıştırmıyor, yalnız derliyor.
// Prop sözleşmesi uyuşmazlıkları ancak render anında ortaya çıkıyor.
//
// Vite'ın SSR yükleyicisi kullanılıyor: '@' alias'ı, JSX ve CSS import'ları
// olduğu gibi çalışıyor, ayrı bir build adımı gerekmiyor.
//
// KAPSAM: ilk render. useEffect ÇALIŞMAZ (SSR), yani veri çeken kod yolu test
// edilmez — bu test "ekran açılır açılmaz patlıyor mu" sorusunu cevaplar,
// "veri gelince doğru mu görünüyor" sorusunu değil.
// Tarayıcı API shim'leri — store'lar modül yüklenirken localStorage okuyor.
// Node'da yoklar; render testinin amacı JSX/prop sözleşmesi, depolama değil.
const bellek = () => {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)),
           removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null,
           get length() { return m.size } }
}
globalThis.localStorage ??= bellek()
globalThis.sessionStorage ??= bellek()
globalThis.navigator ??= { userAgent: 'node', platform: 'node', maxTouchPoints: 0, onLine: true }
globalThis.window ??= globalThis
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} })

import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'

// react/react-router CJS dağıtımları Vite'ın SSR değerlendiricisinde
// "module is not defined" veriyor — onları Node'un kendi çözümlemesine bırak.
const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  ssr: { external: ['react', 'react-dom', 'react-router-dom', 'react-router', 'zustand'] },
  // Gerçek api.js yerine sahte veri: bileşenlerin DOLU veriyle render'ı test
  // edilebilsin. useEffect SSR'de çalışmadığı için veri prop olarak giremiyor.
  // DİKKAT: resolve.alias verilince vite.config'teki '@' tanımı EZİLİYOR —
  // ikisi birden yazılmalı, yoksa tüm '@/...' import'ları çözülemez.
  resolve: {
    alias: [
      // fileURLToPath ŞART: URL.pathname yolu yüzde-kodluyor ve proje yolunda
      // Türkçe karakter var ("ms-yazılım") — kodlanmış yol çözülemiyor.
      { find: /^@\/services\/api$/, replacement: fileURLToPath(new URL('./api-mock.js', import.meta.url)) },
      { find: /^@\//, replacement: fileURLToPath(new URL('../src/', import.meta.url)) },
    ],
  },
})
let pass = 0, fail = 0
const ok = (c, m, d) => { c ? (pass++, console.log(`  ✓ ${m}`)) : (fail++, console.log(`  ✗ ${m}${d ? `\n     ${d}` : ''}`)) }

const load = (p) => vite.ssrLoadModule(p)
const { MemoryRouter } = await import('react-router-dom')
const wrap = (el) => h(MemoryRouter, null, el)

function render(label, el) {
  try { renderToStaticMarkup(wrap(el)); ok(true, label) }
  catch (e) { ok(false, label, String(e.message).slice(0, 200)) }
}

// ——— UI sözleşmeleri: emoji VE component ikonu ———
const { EmptyState } = await load('/src/components/ui/EmptyState.jsx')
const { Badge } = await load('/src/components/ui/Badge.jsx')
const { StatCard } = await load('/src/components/ui/StatCard.jsx')
const { Segmented } = await load('/src/components/ui/Segmented.jsx')
const { Users, Wallet } = await import('lucide-react')

console.log('\n── UI bileşenleri ──')
render('EmptyState + emoji ikon', h(EmptyState, { icon: '📭', title: 'x' }))
render('EmptyState + lucide component ikonu (canlıyı çökerten durum)', h(EmptyState, { icon: Users, title: 'x' }))
render('Badge + title (tooltip)', h(Badge, { variant: 'warning', title: 'açıklama' }, 'etiket'))
render('StatCard tıklanabilir', h(StatCard, { label: 'x', value: '1', icon: Wallet, to: '/admin' }))
render('Segmented', h(Segmented, { value: 'a', onChange: () => {}, options: [{ value: 'a', label: 'A', icon: Wallet }] }))

// ——— Yeni sayfa/parça bileşenleri: veri YOK hâli (ilk açılış) ———
console.log('\n── Panel bileşenleri (boş veri) ──')
const T = await load('/src/pages/Admin/ProducerPayments/ProducerBalanceTable.jsx')
render('ProducerBalanceTable · boş liste', h(T.ProducerBalanceTable, {
  rows: [], total: 0, page: 1, setPage: () => {}, sort: { by: 'balance', dir: 'desc' }, onSort: () => {},
  selected: new Set(), onToggle: () => {}, onToggleAll: () => {}, onPay: () => {}, onDetail: () => {}, periodLabel: 'x',
}))
const ornek = {
  id: 1, name: 'Test Üretici', active: true, regionId: 1, regionName: 'Bölge', allRegions: false,
  pricePremiumPct: 5, balance: 1260, intakeTotal: 1260, paidTotal: 0, adjustTotal: 0, movementCount: 1,
  lastPaymentAt: null, lastDebtAt: new Date().toISOString(), pendingEntryCount: 2,
}
render('ProducerBalanceTable · dolu satır', h(T.ProducerBalanceTable, {
  rows: [ornek], total: 1, page: 1, setPage: () => {}, sort: { by: 'balance', dir: 'desc' }, onSort: () => {},
  selected: new Set(), onToggle: () => {}, onToggleAll: () => {}, onPay: () => {}, onDetail: () => {}, periodLabel: 'x',
}))

const S = await load('/src/pages/Admin/ProducerPayments/SummaryCards.jsx')
render('SummaryCards', h(S.SummaryCards, {
  summary: { period: {}, totalOutstanding: 100, producersWithBalance: 1, totalAdvance: 0,
             periodIntake: 100, periodPaid: 0, unpricedEntryCount: 3, unpricedProductCount: 1 },
}))

const F = await load('/src/pages/Admin/ProducerPayments/ProducerFilters.jsx')
render('ProducerFilters', h(F.ProducerFilters, {
  filters: { regionId: '', q: '', dateFrom: '', dateTo: '', onlyDebt: true, minBalance: '', includeInactive: false },
  setFilters: () => {}, regions: [{ id: 1, name: 'Bölge' }], resultCount: 0,
}))

const B = await load('/src/pages/Admin/ProducerPayments/BulkActionBar.jsx')
render('BulkActionBar', h(B.BulkActionBar, { count: 2, total: 500, onClear: () => {}, onPay: () => {} }))

const PM = await load('/src/pages/Admin/ProducerPayments/PaymentModal.jsx')
render('PaymentModal', h(PM.PaymentModal, { producer: ornek, onClose: () => {}, onSaved: () => {} }))

const BM = await load('/src/pages/Admin/ProducerPayments/BulkPaymentModal.jsx')
render('BulkPaymentModal', h(BM.BulkPaymentModal, { producers: [ornek], onClose: () => {}, onSaved: () => {} }))

const DM = await load('/src/pages/Admin/ProducerPayments/detail/ProducerDetailModal.jsx')
render('ProducerDetailModal', h(DM.ProducerDetailModal, {
  producer: ornek, dateFrom: '', dateTo: '', onClose: () => {}, onPay: () => {}, onChanged: () => {},
}))

const PG = await load('/src/pages/Admin/Prices/PriceGrid.jsx')
render('PriceGrid · marj hesabı', h(PG.PriceGrid, {
  mode: 'purchase', products: [{ id: 1, name: 'Domates', icon: '🍅', unit: 'CASE' }],
  saleCells: { 1: { value: '15', original: '15' } },
  purchaseCells: { 1: { value: '12', original: '12', inherited: true, from: '2026-08-25' } },
  saving: null, onChange: () => {}, onBlur: () => {},
}))
render('PriceGrid · negatif marj (zararına satış uyarısı)', h(PG.PriceGrid, {
  mode: 'purchase', products: [{ id: 1, name: 'Domates', icon: '🍅', unit: 'CASE' }],
  saleCells: { 1: { value: '10', original: '10' } },
  purchaseCells: { 1: { value: '14', original: '14' } },
  saving: null, onChange: () => {}, onBlur: () => {},
}))

const R = await load('/src/components/PaymentReceiptPrint.jsx')
const { usePrintStore } = await load('/src/store/printStore.js')
usePrintStore.setState({ receipt: {
  kind: 'producer-payment', producerName: 'Test', regionName: 'Bölge', amount: 1000,
  method: 'CASH', occurredAt: new Date().toISOString(), receiptNo: 1, createdBy: 'Admin',
  balanceBefore: 1500, balanceAfter: 500, note: 'nakit',
} })
render('PaymentReceiptPrint · makbuz', h(R.PaymentReceiptPrintHost, null))

// ——— Veri çeken bileşenler: ilk render (yükleniyor/boş hâli) ———
//
// SSR'de useEffect çalışmadığı için bunlar veriyi göstermez; test edilen şey
// import zinciri ve ilk render'ın ayakta kalması. Dolu-veri render'ı ancak
// jsdom + effect beklemesiyle test edilebilir (bugün kurulu değil) — bu yüzden
// tablo gövdelerinin dolu hâli hâlâ elle gözden geçirilmeli.
console.log('\n── Veri çeken bileşenler (ilk render) ──')
for (const [ad, yol, dısa, props] of [
  ['ProducerPaymentsPage', '/src/pages/Admin/ProducerPayments/ProducerPaymentsPage.jsx', 'ProducerPaymentsPage', {}],
  ['UnpricedIntakeTab', '/src/pages/Admin/ProducerPayments/UnpricedIntakeTab.jsx', 'UnpricedIntakeTab', { dateFrom: '', dateTo: '', onChanged: () => {} }],
  ['PaymentsHistoryTab', '/src/pages/Admin/ProducerPayments/PaymentsHistoryTab.jsx', 'PaymentsHistoryTab', { dateFrom: '', dateTo: '' }],
  ['AccountStatementTab', '/src/pages/Admin/ProducerPayments/detail/AccountStatementTab.jsx', 'AccountStatementTab', { producerId: 1, dateFrom: '', dateTo: '' }],
  ['IntakeBreakdownTab', '/src/pages/Admin/ProducerPayments/detail/IntakeBreakdownTab.jsx', 'IntakeBreakdownTab', { producerId: 1, dateFrom: '', dateTo: '' }],
  ['PaymentHistoryTab', '/src/pages/Admin/ProducerPayments/detail/PaymentHistoryTab.jsx', 'PaymentHistoryTab', { producer: ornek, dateFrom: '', dateTo: '', onChanged: () => {} }],
  ['PricesPage', '/src/pages/Admin/Prices/PricesPage.jsx', 'PricesPage', {}],
  ['ProducerPriceTab', '/src/pages/Admin/Prices/ProducerPriceTab.jsx', 'ProducerPriceTab', { date: '2026-08-26', products: [{ id: 1, name: 'Domates', icon: '🍅', unit: 'CASE' }] }],
]) {
  try {
    const m = await load(yol)
    render(ad, h(m[dısa], props))
  } catch (e) { ok(false, ad, String(e.message).slice(0, 200)) }
}

// ——— İrsaliye fişi: indirim gösterimi ———
//
// Fişte tutar NET fiyattan, gösterim "normal → net". Bu blok çıktının içeriğini
// de kontrol ediyor (sadece "patlamadı" değil): indirim satırında iki rakam da
// görünmeli, indirimsiz satırda tek rakam.
console.log('\n── İrsaliye fişi (indirim) ──')
{
  const { IrsaliyeSheet } = await load('/src/components/IrsaliyePrint.jsx')
  const kalem = (id, ad, ppk, lst) => ({
    id, pricePerKg: ppk, listPricePerKg: lst,
    entry: { caseCount: 10, weight: 100, unit: 'CASE', product: { name: ad } },
  })
  const fis = {
    id: 1, createdAt: new Date().toISOString(), market: { no: 1, name: 'Pazar 1' },
    marketCaseBalance: 0,
    items: [kalem(1, 'Domates', 50, 70), kalem(2, 'Biber', 40, null)],
  }
  let html = ''
  try { html = renderToStaticMarkup(wrap(h(IrsaliyeSheet, { exit: fis }))) ; ok(true, 'fiş render edildi') }
  catch (e) { ok(false, 'fiş render edildi', String(e.message).slice(0, 200)) }
  ok(html.includes('print-strike'), 'indirimli kalemde normal fiyat üstü çizili basıldı')
  ok(html.includes('70,00') && html.includes('50,00'), 'indirimli satırda İKİ rakam da var (70 → 50)')
  // Biber indirimsiz: 40 tek başına görünmeli, yanında ok/çizgi olmamalı
  const biberBolumu = html.split('Biber')[1] ?? ''
  ok(biberBolumu.includes('40,00') && !biberBolumu.split('</tr>')[0].includes('print-strike'),
     'indirimsiz kalemde tek rakam (sahte indirim basılmıyor)')
}

// ——— Kasa darası: frontend ↔ backend KİLİT ADIMLI mı? ———
//
// Ekrandaki önizleme ile kayda yazılan net AYNI olmalı. İki dosya ayrı ayrı
// duruyor (biri tarayıcıda, biri sunucuda) ve ayrışırlarsa operatör bir rakam
// görüp kayda başkası yazılır — bunu ancak böyle bir karşılaştırma yakalar.
console.log('\n── Kasa darası (frontend ↔ backend) ──')
{
  const be = await import('../../backend/src/utils/tare.js')
  const fe = await load('/src/utils/tare.js')

  ok(be.TARE_PER_CASE_KG === fe.TARE_PER_CASE_KG,
     `kasa başına dara aynı (${be.TARE_PER_CASE_KG} kg)`)

  const durumlar = [
    { unit: 'CASE', caseCount: 10, disposableCase: false, weight: 100 },
    { unit: 'CASE', caseCount: 10, disposableCase: true, weight: 100 },
    { unit: 'CASE', caseCount: 0, disposableCase: false, weight: 100 },
    { unit: 'CASE', caseCount: 10, disposableCase: false, weight: 229.98 },
    { unit: 'CASE', caseCount: 1, disposableCase: false, weight: 2.5 },
    { unit: 'BUNCH', caseCount: 5, disposableCase: false, weight: 30 },
    { unit: 'PIECE', caseCount: 5, disposableCase: false, weight: 8 },
  ]
  let ayrisan = null
  for (const d of durumlar) {
    const b = be.applyTare(d)
    const f = fe.previewTare(d)
    // Geçersiz durumda backend hata döner, frontend gecersiz işaretler —
    // ikisi de "bu kayıt olmaz" demeli.
    if (b.tare !== f.tare || b.net !== f.net || Boolean(b.error) !== f.gecersiz) {
      ayrisan = `${JSON.stringify(d)} → be ${JSON.stringify(b)} / fe ${JSON.stringify(f)}`
      break
    }
  }
  ok(!ayrisan, 'dara hesabı iki tarafta aynı sonucu veriyor', ayrisan ?? '')

  const gecersiz = { unit: 'CASE', caseCount: 10, disposableCase: false, weight: 15 }
  ok(Boolean(be.applyTare(gecersiz).error) && fe.previewTare(gecersiz).gecersiz,
     'dara brütü aşınca ikisi de reddediyor')
}

// ——— Fatura onay widget'ı + fişteki fatura no ———
console.log('\n── Fatura onayı ──')
{
  const { InvoiceApprovalWidget } = await load('/src/pages/Admin/Invoices/InvoiceApprovalWidget.jsx')
  // İlk render (SSR'da useEffect çalışmaz → yükleniyor hâli). Amaç prop
  // sözleşmesi: Segmented/EmptyState/Pagination'a yanlış tipte prop geçilirse
  // build değil YALNIZ render patlar (bkz. EmptyState icon vakası).
  try {
    renderToStaticMarkup(wrap(h(InvoiceApprovalWidget)))
    ok(true, 'widget render edildi')
  } catch (e) { ok(false, 'widget render edildi', String(e.message).slice(0, 200)) }

  const { ExitBadges, InvoiceBadge } = await load('/src/components/ui/ExitBadges.jsx')
  const onayli = renderToStaticMarkup(wrap(h(ExitBadges, {
    exit: { invoiceNo: 'MSK-42', invoiceAt: new Date().toISOString(), printedAt: new Date().toISOString(), printCount: 2 },
  })))
  ok(onayli.includes('MSK-42'), 'onaylı rozetinde fatura no yazıyor')
  ok(onayli.includes('İrsaliye basıldı'), 'baskı rozeti çıktı')
  ok(onayli.includes('×2'), 'yeniden baskı sayısı görünüyor')

  // Tam sayfa hâli + sol menü + giriş ekranı kutucuğu
  const { InvoiceApprovalPage } = await load('/src/pages/Admin/Invoices/InvoiceApprovalPage.jsx')
  try {
    const sayfa = renderToStaticMarkup(wrap(h(InvoiceApprovalPage)))
    ok(sayfa.includes('Fatura Onayı'), 'tam sayfa render edildi')
  } catch (e) { ok(false, 'tam sayfa render edildi', String(e.message).slice(0, 200)) }

  // Satırın kendisi tıklanabilir olmalı — kullanıcı fatura numarasının üstüne
  // basıp düzenlemek istiyor. Statik: tıklama davranışı SSR'da render edilmiyor.
  const widgetKaynak = await readFile(new URL('../src/pages/Admin/Invoices/InvoiceApprovalWidget.jsx', import.meta.url), 'utf8')
  ok(/onClick=\{\(\) => \{ if \(acikId !== ex\.id\) ac\(ex\) \}\}/.test(widgetKaynak), 'satıra tıklayınca düzenleme açılıyor')
  ok(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/.test(widgetKaynak), 'buton grubu satır tıklamasını yutuyor')
  ok(/<button type="button" onClick=\{\(\) => ac\(ex\)\} title="Fatura numarasını düzenle">/.test(widgetKaynak), 'fatura no rozeti de tıklanabilir')

  // Onaylarken fiyat girişi
  ok(/ex\.products\?\.length/.test(widgetKaynak), 'fişteki TÜM ürünler için fiyat alanı açılıyor')
  ok(/api\.setExitPrices\(/.test(widgetKaynak), 'fiyat düzeltmesi tek uçtan gidiyor')
  ok(widgetKaynak.indexOf('api.setExitPrices(') < widgetKaynak.indexOf('await api.setExitInvoiceNo'),
     'ÖNCE fiyat, SONRA fatura no yazılıyor')
  ok(/Number\(v\) !== p\.pricePerKg/.test(widgetKaynak), 'yalnız DEĞİŞEN fiyat kaydediliyor')
  ok(/p\.pricePerKg == null \? '' : String\(p\.pricePerKg\)/.test(widgetKaynak),
     'kutular mevcut fiyatla doluyor (düzeltilebilsin)')
  ok(/bayinin bu irsaliyeden doğan borcu da aynı anda güncellenir/.test(widgetKaynak),
     'cari etkisi ekranda uyarılıyor')

  // Düzenleme ekranı kullanıcı SORMAMALI — oturumdaki isim yazılıyor.
  const gecmisKaynak = await readFile(new URL('../src/pages/Admin/HistoryPage.jsx', import.meta.url), 'utf8')
  ok(!/Düzenleyen kullanıcı seçilmeli/.test(gecmisKaynak), 'düzenlemede kullanıcı seçimi zorunluluğu kalktı')
  ok(!/>— Kullanıcı seçin —<\/option>[\s\S]{0,400}Düzenleyen/.test(gecmisKaynak), 'düzenleme ekranında kullanıcı kutusu yok')
  ok(/editedBy gönderilmiyor/.test(gecmisKaynak), 'editedBy istemciden gönderilmiyor')

  // Sol menü: fatura onayı ACCOUNTING'e de görünmeli (fatura eşleştirmesi
  // muhasebenin asıl işi). adminOnly eklenirse bu test kırılır.
  const { AdminLayout } = await load('/src/pages/Admin/AdminLayout.jsx')
  const menu = renderToStaticMarkup(wrap(h(AdminLayout)))
  ok(menu.includes('Fatura Onayı'), 'sol menüde görünüyor')
  ok(menu.includes('/admin/fatura-onay'), 'menü doğru adrese gidiyor')

  // Bekleyen sayısı rozeti — "9+" kuralı
  const { badgeText } = await load('@/store/invoiceStore')
  ok(badgeText(0) === null, 'sıfırda rozet basılmıyor')
  ok(badgeText(null) === null, 'sayı bilinmiyorken rozet basılmıyor')
  ok(badgeText(1) === '1' && badgeText(9) === '9', '1-9 arası sayı olduğu gibi')
  ok(badgeText(10) === '9+' && badgeText(152) === '9+', "10 ve üstü '9+' gösteriyor")

  // Rozetin MENÜYE BAĞLANDIĞI statik doğrulanıyor, render ile değil: SSR
  // koşucusunda teste yüklenen store ile bileşenin gördüğü örnek ayrışıyor
  // (aynı tuzağa RoleSelectPage'de de düşüldü), bu yüzden store'a yazılan sayı
  // menüye hiç ulaşmıyor ve render testi rozet hakkında bir şey kanıtlamıyor.
  // "9+" kuralının kendisi yukarıda saf fonksiyonla test edildi; burada
  // yalnızca kablonun takılı olduğu doğrulanıyor.
  const layoutKaynak = await readFile(new URL('../src/pages/Admin/AdminLayout.jsx', import.meta.url), 'utf8')
  ok(/badge: 'invoicePending'/.test(layoutKaynak), 'fatura onayı satırı rozet taşıyor')
  ok(/badgeText\(bekleyen\)/.test(layoutKaynak), 'rozet metni badgeText ile üretiliyor')
  ok(/badge === 'invoicePending' && bekleyenRozet/.test(layoutKaynak), 'rozet yalnız o satırda ve sayı varken basılıyor')
  ok(/useInvoiceStore\(\(st\) => st\.pendingCount\)/.test(layoutKaynak), 'sayı ortak store"dan okunuyor')

  // Giriş ekranındaki kutucuk STATİK okunuyor, render ile değil.
  //
  // NEDEN: RoleSelectPage kullanıcıyı store'dan alıyor ve SSR koşucusunda
  // store'a yazılan kullanıcı bileşene ulaşmıyor (ayrı modül örneği) — render
  // testi kullanıcıyı null görüp hep boş liste basıyordu, yani rol kuralı
  // hakkında hiçbir şey kanıtlamıyordu. Kutucuk zaten bir yapılandırma satırı;
  // asıl doğrulanması gereken şey rol listesi ve adres.
  const rolSayfasi = await readFile(new URL('../src/pages/RoleSelectPage.jsx', import.meta.url), 'utf8')
  const kutu = rolSayfasi.match(/\{[^{}]*key: 'fatura-onay'[\s\S]*?\n  \}/)
  ok(!!kutu, 'giriş ekranında fatura onayı kutucuğu tanımlı')
  ok(/to: '\/admin\/fatura-onay'/.test(kutu?.[0] ?? ''), 'kutucuk onay sayfasına gidiyor')
  ok(/roles: \['ADMIN', 'ACCOUNTING'\]/.test(kutu?.[0] ?? ''), 'kutucuk ADMIN + ACCOUNTING rollerinde')

  const bekleyen = renderToStaticMarkup(wrap(h(InvoiceBadge, { exit: { invoiceNo: null } })))
  ok(bekleyen.includes('Fatura bekliyor'), 'onaysızda bekliyor rozeti')

  // Basılmamış irsaliyede "basılmadı" YAZMAMALI: bu bilgi güvenilir değil ve
  // özellikten önceki fişlerin hepsi basılmış olmasına rağmen printedAt'i boş.
  const basilmamis = renderToStaticMarkup(wrap(h(ExitBadges, { exit: { invoiceNo: null, printedAt: null } })))
  ok(!/bas[ıi]lmad/i.test(basilmamis), 'basılmamışta yanlış etiket yok')

  // Fişte fatura no: yalnız girilmişse basılır
  const { IrsaliyeSheet } = await load('/src/components/IrsaliyePrint.jsx')
  const temel = {
    id: 7, createdAt: new Date().toISOString(), market: { no: 1, name: 'Pazar 1' }, marketCaseBalance: 0,
    items: [{ id: 1, pricePerKg: 10, entry: { caseCount: 2, weight: 20, unit: 'CASE', product: { name: 'Domates' } } }],
  }
  const faturali = renderToStaticMarkup(wrap(h(IrsaliyeSheet, { exit: { ...temel, invoiceNo: 'MSK-99' } })))
  ok(faturali.includes('Fatura No:') && faturali.includes('MSK-99'), 'fişte fatura no basıldı')
  const faturasiz = renderToStaticMarkup(wrap(h(IrsaliyeSheet, { exit: temel })))
  ok(!faturasiz.includes('Fatura No'), 'fatura yoksa boş satır basılmıyor')
}

await vite.close()
console.log(`\n═══ ${pass} geçti, ${fail} başarısız ═══`)
process.exit(fail ? 1 : 0)
