import { api, fetchAllPages } from '@/services/api'
import { formatDate } from '@/utils/formatters'
import { METHOD_LABEL, TYPE_META } from './constants'

// Export satırlarında TUTARLAR HAM SAYI olarak yazılır, formatTL ile DEĞİL:
// "1.234,56 ₺" Excel'de metin olur ve toplanamaz. Başlıklarda "(TL)" yazıyor —
// HistoryPage'in konvansiyonu.

export function balancesExport(rows, { periodLabel } = {}) {
  return () => ({
    title: 'Üretici Bakiyeleri',
    subtitle: periodLabel,
    columns: ['Üretici', 'Bölge', 'Hareket', 'Mal Bedeli (TL)', 'Ödenen (TL)', 'Kalan (TL)', 'Son Ödeme', 'Prim (%)', 'Fiyatsız Kayıt'],
    rows: rows.map((r) => [
      r.name,
      r.allRegions ? 'Tüm bölgeler' : (r.regionName ?? 'Atanmamış'),
      r.movementCount,
      r.intakeTotal,
      r.paidTotal,
      r.balance,
      r.lastPaymentAt ? formatDate(r.lastPaymentAt).slice(0, 10) : 'Hiç ödenmedi',
      r.pricePremiumPct ?? 0,
      r.pendingEntryCount ?? 0,
    ]),
  })
}

// Detay = ÜÇ SEKMELİ TEK DOSYA: muhasebeci üreticiye tek ek gönderiyor.
// rows AÇIKÇA veriliyor — ExportButton'ın uyarısı: sheets'ten türetilirse
// denetim kaydındaki satır sayısı şişer.
export function producerDetailExport(producer, params) {
  return async () => {
    // fetchAllPages sayfa parametrelerini kendisi ekliyor (fn, params) —
    // ekrandaki sayfa değil, filtreye uyan TÜM kayıtlar iniyor.
    const [ledger, intakes, payments] = await Promise.all([
      fetchAllPages((p) => api.getProducerStatement(producer.id, p), params),
      fetchAllPages((p) => api.getProducerIntakes(producer.id, p), params),
      fetchAllPages(api.getProducerPaymentHistory, { ...params, producerId: producer.id }),
    ])

    const sheets = [
      {
        name: 'Hesap Ekstresi',
        columns: ['Tarih', 'Tip', 'Açıklama', 'Borç (TL)', 'Alacak (TL)', 'Bakiye (TL)'],
        rows: ledger.map((r) => [
          formatDate(r.occurredAt),
          TYPE_META[r.type]?.label ?? r.type,
          r.note ?? '',
          r.direction > 0 ? r.amount : '',
          r.direction < 0 ? r.amount : '',
          r.runningBalance,
        ]),
      },
      {
        name: 'Mal Kabul',
        columns: ['Tarih', 'Ürün', 'Miktar', 'Birim', 'Alış Fiyatı (TL)', 'Fiyat Kaynağı', 'Tutar (TL)'],
        rows: intakes.map((r) => [
          formatDate(r.createdAt),
          r.product?.name ?? '',
          r.purchaseQty ?? r.weight,
          r.unit,
          r.purchasePricePerKg ?? '',
          r.priceSourceLabel ?? '',
          r.amount ?? '',
        ]),
      },
      {
        name: 'Ödemeler',
        columns: ['Tarih', 'Tutar (TL)', 'Yöntem', 'Açıklama', 'Yapan'],
        rows: payments.map((r) => [
          formatDate(r.occurredAt),
          r.amount,
          METHOD_LABEL[r.paymentMethod] ?? '',
          r.note ?? '',
          r.createdBy ?? '',
        ]),
      },
    ]

    return {
      title: `${producer.name} — Cari Hesap`,
      sheets,
      columns: sheets[0].columns,
      rows: sheets.flatMap((s) => s.rows),
    }
  }
}
