import { useCallback, useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatWeight } from '@/utils/formatters'
import { ArrowRight } from 'lucide-react'

export function TransfersPage() {
  const [transfers, setTransfers] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const addToast = useToastStore((s) => s.addToast)

  const load = useCallback(() => {
    setLoading(true)
    const params = {}
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    api.getAdminTransfers(params)
      .then(setTransfers)
      .catch(() => addToast('Transferler yüklenemedi', 'error'))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-text-primary mb-6">🔁 Transfer Geçmişi</h1>

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
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="p-3 text-left font-semibold text-text-secondary">Tarih</th>
                  <th className="p-3 text-left font-semibold text-text-secondary">Ürün</th>
                  <th className="p-3 text-right font-semibold text-text-secondary">Kasa</th>
                  <th className="p-3 text-right font-semibold text-text-secondary">Ağırlık</th>
                  <th className="p-3 text-left font-semibold text-text-secondary">Hareket</th>
                  <th className="p-3 text-left font-semibold text-text-secondary">Not</th>
                  <th className="p-3 text-left font-semibold text-text-secondary">Yapan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transfers.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="p-3 whitespace-nowrap text-text-primary">{formatDate(t.createdAt)}</td>
                    <td className="p-3 text-text-primary font-medium">
                      {t.entry?.product?.name ?? '—'}
                      {t.entry?.quality && <span className="text-xs text-text-muted ml-2">({t.entry.quality.name})</span>}
                    </td>
                    <td className="p-3 text-right tabular-nums">{t.entry?.caseCount ?? '—'}</td>
                    <td className="p-3 text-right tabular-nums">{t.entry?.weight ? formatWeight(t.entry.weight) : '—'}</td>
                    <td className="p-3">
                      <div className="inline-flex items-center gap-2 text-sm">
                        <Badge variant="default">{t.fromMarket?.name ?? '—'}</Badge>
                        <ArrowRight className="w-3 h-3 text-text-muted" />
                        <Badge variant="primary">{t.toMarket?.name ?? '—'}</Badge>
                      </div>
                    </td>
                    <td className="p-3 text-xs text-text-muted max-w-xs truncate">{t.note ?? '—'}</td>
                    <td className="p-3 text-xs text-text-muted">{t.createdBy ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
