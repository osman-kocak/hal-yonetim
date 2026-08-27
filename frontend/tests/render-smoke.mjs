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

await vite.close()
console.log(`\n═══ ${pass} geçti, ${fail} başarısız ═══`)
process.exit(fail ? 1 : 0)
