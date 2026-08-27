import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { useAuthStore } from '@/store/authStore'
import { hasAnyRole } from '@/utils/roles'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Pagination } from '@/components/ui/Pagination'
import { formatDate } from '@/utils/formatters'
import { formatTL } from '@/utils/currency'
import { printReceipt } from '@/store/printStore'
import { Printer, Banknote, Trash2 } from 'lucide-react'
import { PAGE_SIZE, METHOD_LABEL } from '../constants'

export function PaymentHistoryTab({ producer, dateFrom, dateTo, onChanged }) {
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [silinecek, setSilinecek] = useState(null)
  const [busy, setBusy] = useState(false)
  const user = useAuthStore((s) => s.user)
  const addToast = useToastStore((s) => s.addToast)
  // Ödeme SİLME yalnız ADMIN: muhasebeci hata yaptıysa ters düzeltme girmeli,
  // kaydı yok etmemeli — silinen ödeme denetim izini de götürür.
  const isAdmin = hasAnyRole(user, 'ADMIN')

  useEffect(() => {
    setLoading(true)
    api.getProducerPaymentHistory({ producerId: producer.id, dateFrom, dateTo, page, limit: PAGE_SIZE })
      .then(setData)
      .finally(() => setLoading(false))
  }, [producer.id, dateFrom, dateTo, page])

  if (loading && !data) return <div className="flex justify-center py-12"><LoadingSpinner className="text-primary" /></div>
  if (!data?.data?.length) {
    return <EmptyState icon={Banknote} title="Ödeme yok" description="Bu üreticiye seçili aralıkta ödeme yapılmamış." />
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-gray-50 border-b border-border">
            <tr>
              <th className="p-2 text-left font-semibold text-text-secondary">Tarih</th>
              <th className="p-2 text-right font-semibold text-text-secondary">Tutar</th>
              <th className="p-2 text-left font-semibold text-text-secondary">Yöntem</th>
              <th className="p-2 text-left font-semibold text-text-secondary">Açıklama</th>
              <th className="p-2 text-left font-semibold text-text-secondary">Yapan</th>
              <th className="p-2 text-right font-semibold text-text-secondary"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.data.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="p-2 whitespace-nowrap text-text-secondary">{formatDate(r.occurredAt)}</td>
                <td className="p-2 text-right tabular-nums font-semibold text-green-700">{formatTL(r.amount)}</td>
                <td className="p-2">
                  {r.paymentMethod
                    ? <Badge variant="primary">{METHOD_LABEL[r.paymentMethod] ?? r.paymentMethod}</Badge>
                    : <span className="text-text-muted">—</span>}
                </td>
                <td className="p-2 text-text-secondary max-w-xs truncate" title={r.note ?? ''}>{r.note ?? '—'}</td>
                <td className="p-2 text-text-muted">{r.createdBy ?? '—'}</td>
                <td className="p-2 text-right">
                  {/* Ödeme SİLME yalnız ADMIN: muhasebeci hata yaptıysa ters
                      düzeltme girmeli, kaydı yok etmemeli — silinen ödeme
                      denetim izini de götürür. */}
                  {isAdmin && (
                    <Button size="sm" variant="ghost" title="Ödemeyi sil"
                      onClick={() => setSilinecek(r)}>
                      <Trash2 className="w-4 h-4 text-error" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" title="Makbuz yazdır"
                    onClick={() => printReceipt({
                      kind: 'producer-payment',
                      producerName: producer.name,
                      regionName: producer.regionName,
                      amount: r.amount,
                      method: r.paymentMethod,
                      occurredAt: r.occurredAt,
                      receiptNo: r.id,
                      createdBy: r.createdBy,
                      note: r.note,
                      // Geçmiş ödemede o anki bakiyeler kayıtlı değil; makbuz
                      // bunları boş basar. Yeni ödemede backend gönderiyor.
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

      <ConfirmDialog
        open={Boolean(silinecek)}
        onClose={() => setSilinecek(null)}
        loading={busy}
        title="Ödemeyi sil"
        description={silinecek
          ? `${formatTL(silinecek.amount)} tutarındaki ödeme kaydı silinecek ve üreticinin bakiyesi o kadar artacak. Bu işlem geri alınamaz.`
          : ''}
        onConfirm={async () => {
          setBusy(true)
          try {
            await api.deleteLedgerEntry(silinecek.id)
            addToast('Ödeme silindi')
            setSilinecek(null)
            setPage(1)
            const r = await api.getProducerPaymentHistory({ producerId: producer.id, dateFrom, dateTo, page: 1, limit: PAGE_SIZE })
            setData(r)
            onChanged?.()
          } catch (e) {
            addToast(e?.response?.data?.error ?? 'Ödeme silinemedi', 'error')
          } finally { setBusy(false) }
        }}
      />
    </div>
  )
}
