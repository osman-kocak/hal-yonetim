// TL biçimleme ve tutar okuma — TEK KARAR NOKTASI.
//
// formatTL kod tabanında iki kez tanımlıydı ve İKİSİ FARKLI davranıyordu:
// FinancePage kuruşlu, DashboardPage kuruşsuz. Üretici ödeme paneli 10+ dosyada
// kullanacak; kopyalamak on iki kopya demekti.
//
// Intl.NumberFormat instance'ları modül seviyesinde cache'li — eski kopyalar
// her çağrıda yeni instance kuruyordu, 500 hücrelik bir tabloda ölçülebilir
// maliyet.

const TRY = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })
const TRY0 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })
const PLAIN = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatTL(value) {
  return TRY.format(value ?? 0)
}

// Dashboard KPI kartları gibi kuruşun gürültü olduğu yerler
export function formatTLShort(value) {
  return TRY0.format(value ?? 0)
}

// YAZDIRMA ve PDF için: jsPDF'in gömülü Arial'inde ₺ simgesi YOK ve jsPDF onu
// sessizce düşürüyor (bkz. IrsaliyePrint.jsx). Ekran ile kâğıt ayrışmasın diye
// yazdırılan her tutar bundan geçer.
export function formatTLPlain(value) {
  return `${PLAIN.format(value ?? 0)} TL`
}

// Kullanıcı girdisi → sayı. "1.234,56" · "1234.56" · "1234,56" kabul edilir.
//
// Geçersizse null döner, 0 DÖNMEZ: sıfır geçerli bir tutar, null "girilmedi"
// demek. İkisi karışırsa boş bırakılan alan 0 TL ödeme olarak kaydedilir.
export function parseAmount(input) {
  if (input == null) return null
  let v = String(input).trim().replace(/\s/g, '')
  if (!v) return null
  // Virgül varsa TR biçimi: noktalar binlik ayracıdır, atılır
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.')
  v = v.replace(/[^0-9.-]/g, '')
  // Birden fazla nokta kaldıysa ilki ondalık, kalanlar atılır
  const i = v.indexOf('.')
  if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '')
  if (v === '' || v === '-' || v === '.') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Prim/iskonto etiketi: +%5 · −%3 · —
export function formatPct(value) {
  const v = Number(value)
  if (!Number.isFinite(v) || v === 0) return '—'
  return `${v > 0 ? '+' : '−'}%${Math.abs(v)}`
}
