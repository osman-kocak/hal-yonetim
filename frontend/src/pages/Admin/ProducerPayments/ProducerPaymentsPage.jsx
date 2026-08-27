import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Segmented } from '@/components/ui/Segmented'
import { ExportButton } from '@/components/ui/ExportButton'
import { HandCoins, TriangleAlert, ReceiptText } from 'lucide-react'
import { useProducerPayments } from './useProducerPayments'
import { SummaryCards } from './SummaryCards'
import { ProducerFilters } from './ProducerFilters'
import { ProducerBalanceTable } from './ProducerBalanceTable'
import { BulkActionBar } from './BulkActionBar'
import { PaymentModal } from './PaymentModal'
import { BulkPaymentModal } from './BulkPaymentModal'
import { UnpricedIntakeTab } from './UnpricedIntakeTab'
import { PaymentsHistoryTab } from './PaymentsHistoryTab'
import { ProducerDetailModal } from './detail/ProducerDetailModal'
import { balancesExport } from './exports'

// ÜRETİCİ ÖDEME PANELİ.
//
// Finans sayfasından AYRI bir ekran — o sayfa KAYIT odaklıdır (cari defter,
// her iki taraf, elle düzeltme), bu ekran GÖREV odaklıdır: "bugün kime ne
// ödeyeceğim, kimin bakiyesi kapanmadı, hangi mal kabulün fiyatı girilmemiş".
// FinancePage'in üretici sekmesi ham defter olarak duruyor.
const TABS = [
  { value: 'panel', label: 'Ödeme Paneli', icon: HandCoins },
  { value: 'unpriced', label: 'Fiyatsız Mal Kabul', icon: TriangleAlert },
  { value: 'payments', label: 'Ödeme Geçmişi', icon: ReceiptText },
]

export function ProducerPaymentsPage() {
  // URL state: muhasebeci linki paylaşabilsin, tarayıcı geri tuşu detaydan
  // listeye dönsün (HistoryPage'in useSearchParams deseni).
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') ?? 'panel'
  const setTab = (v) => setSp((p) => { const n = new URLSearchParams(p); n.set('tab', v); return n }, { replace: true })

  const s = useProducerPayments()
  const [selected, setSelected] = useState(new Set())
  const [payTarget, setPayTarget] = useState(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [detail, setDetail] = useState(null)

  const seciliSatirlar = useMemo(
    () => s.sorted.filter((r) => selected.has(r.id)),
    [s.sorted, selected],
  )
  const seciliToplam = seciliSatirlar.reduce((t, r) => t + Math.max(0, r.balance), 0)

  const periodLabel = s.filters.dateFrom || s.filters.dateTo
    ? `Mal bedeli ve ödenen kolonları ${s.filters.dateFrom || '…'} — ${s.filters.dateTo || '…'} aralığını gösterir.`
    : 'Mal bedeli ve ödenen kolonları tüm zamanları gösterir.'

  function toggle(id) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll(checked) {
    setSelected((prev) => {
      const n = new Set(prev)
      for (const r of s.paged) checked ? n.add(r.id) : n.delete(r.id)
      return n
    })
  }
  function odemeSonrasi() {
    setPayTarget(null); setBulkOpen(false); setSelected(new Set()); setDetail(null); s.reload()
  }

  if (s.loading && !s.summary) {
    return <div className="flex justify-center py-20"><LoadingSpinner size="lg" className="text-primary" /></div>
  }

  return (
    <div className="p-6 pb-24">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text-primary">🤝 Üretici Ödeme</h1>
        {tab === 'panel' && (
          <ExportButton
            title="Üretici Bakiyeleri"
            filename={`uretici-bakiye-${new Date().toISOString().slice(0, 10)}`}
            resource="producer-payments"
            prepare={balancesExport(s.sorted, { periodLabel })}
            disabled={!s.sorted.length}
          />
        )}
      </div>

      <div className="mb-4">
        <Segmented
          value={tab} onChange={setTab} className="w-fit"
          options={TABS.map((t) => t.value === 'unpriced' && s.summary?.unpricedEntryCount
            ? { ...t, label: `${t.label} (${s.summary.unpricedEntryCount})` }
            : t)}
        />
      </div>

      {tab === 'panel' && (
        <>
          <SummaryCards
            summary={s.summary}
            onShowDebtors={() => s.setFilters((f) => ({ ...f, onlyDebt: true }))}
            onShowUnpriced={() => setTab('unpriced')}
            onShowPayments={() => setTab('payments')}
          />

          {/* Fiyatsız uyarı şeridi: "borca YAZILMADI" vurgusu şart — kullanıcı
              toplam borcun eksik olduğunu bilmeli. */}
          {s.summary?.unpricedEntryCount > 0 && (
            <button type="button" onClick={() => setTab('unpriced')}
              className="w-full flex items-center gap-3 mb-4 px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-left hover:bg-red-100 transition-colors">
              <TriangleAlert className="w-5 h-5 text-error shrink-0" />
              <span className="text-sm text-red-900">
                <strong>{s.summary.unpricedEntryCount} mal kabul kaydına</strong> alış fiyatı uygulanamadı
                {' '}({s.summary.unpricedProductCount} üründe fiyat tanımlı değil).
                {' '}Bu kayıtlar üretici borcuna <strong>yazılmadı</strong> — toplam borç eksik görünüyor.
              </span>
              <span className="ml-auto text-sm font-semibold text-error shrink-0">İncele →</span>
            </button>
          )}

          <ProducerFilters
            filters={s.filters} setFilters={s.setFilters} regions={s.regions} resultCount={s.filtered.length}
          />

          <ProducerBalanceTable
            rows={s.paged} total={s.sorted.length} page={s.page} setPage={s.setPage}
            sort={s.sort} onSort={s.toggleSort}
            selected={selected} onToggle={toggle} onToggleAll={toggleAll}
            onPay={setPayTarget} onDetail={setDetail} periodLabel={periodLabel}
          />
        </>
      )}

      {tab === 'unpriced' && (
        <UnpricedIntakeTab dateFrom={s.filters.dateFrom} dateTo={s.filters.dateTo} onChanged={s.reload} />
      )}

      {tab === 'payments' && (
        <PaymentsHistoryTab dateFrom={s.filters.dateFrom} dateTo={s.filters.dateTo} />
      )}

      <BulkActionBar
        count={selected.size} total={seciliToplam}
        onClear={() => setSelected(new Set())} onPay={() => setBulkOpen(true)}
      />

      {payTarget && (
        <PaymentModal producer={payTarget} onClose={() => setPayTarget(null)} onSaved={odemeSonrasi} />
      )}
      {bulkOpen && seciliSatirlar.length > 0 && (
        <BulkPaymentModal producers={seciliSatirlar} onClose={() => setBulkOpen(false)} onSaved={odemeSonrasi} />
      )}
      {detail && (
        <ProducerDetailModal
          producer={detail} dateFrom={s.filters.dateFrom} dateTo={s.filters.dateTo}
          onClose={() => setDetail(null)}
          onPay={(p) => { setDetail(null); setPayTarget(p) }}
          onChanged={s.reload}
        />
      )}
    </div>
  )
}
