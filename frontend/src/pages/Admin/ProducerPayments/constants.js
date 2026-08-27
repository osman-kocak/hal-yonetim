import { Banknote, ArrowLeftRight, ScrollText, Star, Percent, Tag, TriangleAlert } from 'lucide-react'

// Cari hareket tipleri — FinancePage'deki TYPE_META'nın üretici alt kümesi.
// Aynı etiketler bilinçli: iki ekranda farklı isim görünürse kullanıcı
// hangisinin doğru olduğunu sorar.
export const TYPE_META = {
  PRODUCER_DEBT: { label: 'Mal Bedeli', variant: 'warning' },
  PRODUCER_PAYMENT: { label: 'Ödeme', variant: 'success' },
  PRODUCER_ADJUSTMENT: { label: 'Düzeltme', variant: 'primary' },
}

export const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Nakit', icon: Banknote },
  { value: 'TRANSFER', label: 'Havale', icon: ArrowLeftRight },
  { value: 'CHECK', label: 'Çek', icon: ScrollText },
]

export const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]))

// Alış fiyatının hangi katmandan geldiği. Backend enum'uyla birebir
// (utils/purchasePrices.js → PurchasePriceSource) ve Üretici Özel Fiyatı
// sekmesindeki rozetlerle aynı dil.
export const PRICE_SOURCE_META = {
  PRODUCER_SPECIAL: { variant: 'quality-a', icon: Star },
  PRODUCER_PREMIUM: { variant: 'warning', icon: Percent },
  GENERAL: { variant: 'default', icon: Tag },
  NONE: { variant: 'error', icon: TriangleAlert },
}

export const priceSourceMeta = (source) => PRICE_SOURCE_META[source] ?? PRICE_SOURCE_META.NONE

// Bakiye rengi — FinancePage.balanceClasses ile aynı mantık:
// pozitif = borçluyuz (amber), negatif = avans verdik (blue), sıfır = kapalı.
export function balanceTone(balance) {
  if (balance > 0) return 'text-amber-700'
  if (balance < 0) return 'text-blue-700'
  return 'text-green-700'
}

export const PAGE_SIZE = 25

// Bakiyesi olan ama uzun süredir ödenmemiş üretici — panelin en pahalı
// unuttuğu şey. 30 gün eşiği: hal işinde ödeme döngüsü haftalık/iki haftalık.
export const STALE_DAYS = 30

export function isStale(row) {
  if (!(row.balance > 0)) return false
  if (row.lastPaymentAt) return false
  if (!row.lastDebtAt) return false
  return (Date.now() - new Date(row.lastDebtAt).getTime()) > STALE_DAYS * 864e5
}
