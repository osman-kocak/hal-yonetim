import { useEffect, useState } from 'react'
import { api, fetchAllPages } from '@/services/api'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { ExportButton } from '@/components/ui/ExportButton'
import { Segmented } from '@/components/ui/Segmented'
import { formatDate } from '@/utils/formatters'
import { formatTL } from '@/utils/currency'
import { printReceipt } from '@/store/printStore'
import { Printer, Banknote } from 'lucide-react'
import { PAGE_SIZE, PAYMENT_METHODS, METHOD_LABEL } from './constants'

const YONTEM_FILTRE = [{ value: '', label: 'Tümü' }, ...PAYMENT_METHODS]

// Tüm üreticilere yapılan ödemelerin listesi. Kasa mutabakatının ekranı:
// "bugün kasadan ne çıktı, ne havale gitti" sorusunun cevabı.
export function PaymentsHistoryTab({ dateFrom, dateTo }) {
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [method, setMethod] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.getProducerPaymentHistory({ dateFrom, dateTo, paymentMethod: method || undefined, page, limit: PAGE_SIZE })
      .then(setData)
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo, method, page])
  useEffect(() => { setPage(1) }, [method, dateFrom, dateTo])

  if (loading && !data) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" className="text-primary" /></div>

  const sayfaToplam = (data?.data ?? []).reduce((s, r) => s + r.amount, 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Segmented value={method} onChange={setMethod} options={YONTEM_FILTRE} className="w-fit" size="sm" />
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-secondary">
            Bu sayfa: <strong className="tabular-nums">{formatTL(sayfaToplam)}</strong>
          </span>
          <ExportButton
            title="Üretici Ödemeleri"
            filename={`uretici-odemeler-${new Date().toISOString().slice(0, 10)}`}
            resource="producer-payments"
            disabled={!data?.total}
            prepare={async () => {
              const all = await fetchAllPages(api.getProducerPaymentHistory,
                { dateFrom, dateTo, paymentMethod: method || undefined })
              return {
                title: 'Üretici Ödemeleri',
                columns: ['Tarih', 'Üretici', 'Bölge', 'Tutar (TL)', 'Yöntem', 'Açıklama', 'Yapan'],
                // Tutar HAM SAYI: Excel'de toplanabilsin
                rows: all.map((r) => [
                  formatDate(r.occurredAt), r.producer?.name ?? '', r.producer?.region?.name ?? '',
                  r.amount, METHOD_LABEL[r.paymentMethod] ?? '', r.note ?? '', r.createdBy ?? '',
                ]),
              }
            }}
          />
        </div>
      </div>

      {!data?.data?.length ? (
        <EmptyState icon={Banknote} title="Ödeme yok" description="Seçili aralıkta üreticiye ödeme yapılmamış." />
      ) : (
        <>
          <div className="bg-white border border-border rounded-2xl shadow-card overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Tarih</th>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Üretici</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">Tutar</th>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Yöntem</th>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Açıklama</th>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Yapan</th>
                  <th className="p-2 sm:p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.data.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="p-2 sm:p-3 whitespace-nowrap text-text-secondary">{formatDate(r.occurredAt)}</td>
                    <td className="p-2 sm:p-3 font-medium text-text-primary">
                      {r.producer?.name ?? '—'}
                      {r.producer?.region?.name && (
                        <div className="text-[10px] text-text-muted">{r.producer.region.name}</div>
                      )}
                    </td>
                    <td className="p-2 sm:p-3 text-right tabular-nums font-semibold text-green-700">{formatTL(r.amount)}</td>
                    <td className="p-2 sm:p-3">
                      {r.paymentMethod ? <Badge variant="primary">{METHOD_LABEL[r.paymentMethod]}</Badge>
                        : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="p-2 sm:p-3 text-text-secondary max-w-xs truncate" title={r.note ?? ''}>{r.note ?? '—'}</td>
                    <td className="p-2 sm:p-3 text-text-muted">{r.createdBy ?? '—'}</td>
                    <td className="p-2 sm:p-3 text-right">
                      <Button size="sm" variant="ghost" title="Makbuz yazdır"
                        onClick={() => printReceipt({
                          kind: 'producer-payment',
                          producerName: r.producer?.name, regionName: r.producer?.region?.name,
                          amount: r.amount, method: r.paymentMethod, occurredAt: r.occurredAt,
                          receiptNo: r.id, createdBy: r.createdBy, note: r.note,
                          balanceBefore: null, balanceAfter: null,
                        })}>
                        <Printer className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} hasMore={data.hasMore} onChange={setPage} />
        </>
      )}
    </div>
  )
}
