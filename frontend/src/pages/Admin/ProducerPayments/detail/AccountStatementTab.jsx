import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { Badge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { formatDate } from '@/utils/formatters'
import { formatTL } from '@/utils/currency'
import { cn } from '@/utils/cn'
import { ScrollText } from 'lucide-react'
import { TYPE_META, PAGE_SIZE, balanceTone } from '../constants'

// Hesap ekstresi — ESKİDEN YENİYE sıralı (diğer listelerin tersi).
// Yürüyen bakiye ancak bu sırayla anlamlı; backend runningBalance'ı hesaplayıp
// gönderiyor çünkü sayfalı listede istemci kümülatif toplam yapamaz.
export function AccountStatementTab({ producerId, dateFrom, dateTo }) {
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.getProducerStatement(producerId, { dateFrom, dateTo, page, limit: PAGE_SIZE })
      .then(setData)
      .finally(() => setLoading(false))
  }, [producerId, dateFrom, dateTo, page])

  if (loading && !data) return <div className="flex justify-center py-12"><LoadingSpinner className="text-primary" /></div>
  if (!data?.data?.length) {
    return <EmptyState icon={ScrollText} title="Hareket yok" description="Seçili aralıkta cari hareket bulunamadı." />
  }

  return (
    <div className="flex flex-col gap-3">
      {dateFrom && (
        <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-gray-50 text-sm">
          <span className="text-text-secondary">Devreden bakiye</span>
          <span className={cn('font-semibold tabular-nums', balanceTone(data.openingBalance))}>
            {formatTL(data.openingBalance)}
          </span>
        </div>
      )}

      <div className="border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-gray-50 border-b border-border">
            <tr>
              <th className="p-2 text-left font-semibold text-text-secondary">Tarih</th>
              <th className="p-2 text-left font-semibold text-text-secondary">Tip</th>
              <th className="p-2 text-left font-semibold text-text-secondary">Açıklama</th>
              <th className="p-2 text-right font-semibold text-text-secondary">Borç</th>
              <th className="p-2 text-right font-semibold text-text-secondary">Alacak</th>
              <th className="p-2 text-right font-semibold text-text-primary">Bakiye</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.data.map((r) => {
              const meta = TYPE_META[r.type] ?? { label: r.type, variant: 'default' }
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="p-2 whitespace-nowrap text-text-secondary">{formatDate(r.occurredAt)}</td>
                  <td className="p-2"><Badge variant={meta.variant}>{meta.label}</Badge></td>
                  <td className="p-2 text-text-secondary max-w-xs truncate" title={r.note ?? ''}>
                    {r.note ?? '—'}
                    {r.createdBy && <span className="text-text-muted"> · {r.createdBy}</span>}
                  </td>
                  {/* direction backend'den geliyor (signFor) — istemci hangi
                      tipin borç hangisinin alacak olduğunu bilmek zorunda değil */}
                  <td className="p-2 text-right tabular-nums text-amber-700">
                    {r.direction > 0 ? formatTL(r.amount) : ''}
                  </td>
                  <td className="p-2 text-right tabular-nums text-green-700">
                    {r.direction < 0 ? formatTL(r.amount) : ''}
                  </td>
                  <td className={cn('p-2 text-right tabular-nums font-semibold', balanceTone(r.runningBalance))}>
                    {formatTL(r.runningBalance)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} hasMore={data.hasMore} onChange={setPage} />
    </div>
  )
}
