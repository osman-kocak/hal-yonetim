import { useCallback, useEffect, useState } from 'react'
import { api, asList, fetchAllPages } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { formatDate, formatQty, isCountable, unitLabel } from '@/utils/formatters'
import { ArrowRight } from 'lucide-react'
import { ExportButton } from '@/components/ui/ExportButton'

const PAGE_SIZE = 50

export function TransfersPage() {
  const [transfers, setTransfers] = useState([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const addToast = useToastStore((s) => s.addToast)

  const filterParams = useCallback(() => {
    const params = {}
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    return params
  }, [dateFrom, dateTo])

  const load = useCallback(() => {
    setLoading(true)
    api.getAdminTransfers({ ...filterParams(), page, limit: PAGE_SIZE })
      .then((res) => {
        setTransfers(asList(res))
        setTotal(Array.isArray(res) ? res.length : (res?.total ?? 0))
        setHasMore(Array.isArray(res) ? false : (res?.hasMore ?? false))
      })
      .catch(() => addToast('Transferler yüklenemedi', 'error'))
      .finally(() => setLoading(false))
  }, [filterParams, page])

  useEffect(() => { load() }, [load])
  // Filtre değişince 1. sayfaya dön — yoksa 7. sayfada boş liste görünüyor
  useEffect(() => { setPage(1) }, [dateFrom, dateTo])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text-primary">🔁 Transfer Geçmişi</h1>
        <ExportButton
          title="Transfer Geçmişi"
          filename={`transferler-${new Date().toISOString().slice(0, 10)}`}
          // Ekrandaki sayfa değil, filtreye uyan TÜM kayıtlar indirilir
          prepare={async () => ({
            // Miktar birimi satır bazında: kilo ürününde kg, bağ/adette sayı.
            // Sabit "Ağırlık (kg)" başlığı bağ transferlerini kilo gibi okutuyordu.
            columns: ['Tarih', 'Ürün', 'Kasa', 'Miktar', 'Birim', 'Kaynak', 'Hedef', 'Not', 'Yapan'],
            rows: (await fetchAllPages(api.getAdminTransfers, filterParams())).map((t) => [
              formatDate(t.createdAt),
              t.entry?.product?.name ?? '—',
              t.entry?.caseCount ?? '',
              t.entry?.weight ? Number(t.entry.weight).toFixed(isCountable(t.entry?.unit) ? 0 : 2) : '',
              unitLabel(t.entry?.unit),
              t.fromMarket?.name ?? '—',
              t.toMarket?.name ?? '—',
              t.note ?? '',
              t.createdBy ?? '',
            ]),
          })}
          disabled={!transfers.length}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Başlangıç</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Bitiş</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border text-sm"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo('') }}
            className="text-xs text-primary hover:underline"
          >
            Temizle
          </button>
        )}
      </div>

      <div className="bg-white border border-border rounded-2xl shadow-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" className="text-primary" /></div>
        ) : !transfers.length ? (
          <EmptyState icon="🔁" title="Transfer kaydı yok" description="Depodan başka pazara yapılan transferler burada listelenir." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary hidden md:table-cell">Tarih</th>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Ürün</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">Kasa</th>
                  <th className="p-3 text-right font-semibold text-text-secondary hidden sm:table-cell">Miktar</th>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Hareket</th>
                  <th className="p-3 text-left font-semibold text-text-secondary hidden lg:table-cell">Not</th>
                  <th className="p-3 text-left font-semibold text-text-secondary hidden lg:table-cell">Yapan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transfers.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="p-3 whitespace-nowrap text-text-primary hidden md:table-cell">{formatDate(t.createdAt)}</td>
                    <td className="p-2 sm:p-3 text-text-primary font-medium">
                      <div className="flex flex-col">
                        <span>{t.entry?.product?.name ?? '—'}</span>
                        <span className="md:hidden text-[10px] text-text-muted mt-0.5">{formatDate(t.createdAt)}</span>
                      </div>
                    </td>
                    <td className="p-2 sm:p-3 text-right tabular-nums">{t.entry?.caseCount ?? '—'}</td>
                    {/* Miktar birimiyle: bağ/adet transferi kilo gibi okunmasın */}
                    <td className="p-3 text-right tabular-nums hidden sm:table-cell">{t.entry?.weight ? formatQty(t.entry.weight, t.entry.unit) : '—'}</td>
                    <td className="p-2 sm:p-3">
                      <div className="inline-flex items-center gap-1 sm:gap-2 text-[10px] sm:text-sm">
                        <Badge variant="default">{t.fromMarket?.name ?? '—'}</Badge>
                        <ArrowRight className="w-3 h-3 text-text-muted" />
                        <Badge variant="primary">{t.toMarket?.name ?? '—'}</Badge>
                      </div>
                    </td>
                    <td className="p-3 text-xs text-text-muted max-w-xs truncate hidden lg:table-cell">{t.note ?? '—'}</td>
                    <td className="p-3 text-xs text-text-muted hidden lg:table-cell">{t.createdBy ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        hasMore={hasMore}
        onChange={setPage}
      />
    </div>
  )
}
