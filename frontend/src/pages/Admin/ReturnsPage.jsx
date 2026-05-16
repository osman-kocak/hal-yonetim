import { useCallback, useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ExportButton } from '@/components/ui/ExportButton'
import { formatDate, formatWeight } from '@/utils/formatters'
import { Trash2, RotateCcw, AlertTriangle } from 'lucide-react'

const fmtTL = (n) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(Number(n)))

export function ReturnsPage() {
  const [returns, setReturns] = useState([])
  const [markets, setMarkets] = useState([])
  const [loading, setLoading] = useState(true)
  const [marketId, setMarketId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterType, setFilterType] = useState('all') // all | depo | discarded
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const load = useCallback(() => {
    setLoading(true)
    const params = {}
    if (marketId) params.marketId = marketId
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    api.listDepoReturns(params)
      .then(setReturns)
      .catch(() => addToast('İadeler yüklenemedi', 'error'))
      .finally(() => setLoading(false))
  }, [marketId, dateFrom, dateTo])

  useEffect(() => {
    api.getAdminMarkets().then((all) => setMarkets((all ?? []).filter((m) => m.no !== 0))).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = returns.filter((r) => {
    if (filterType === 'depo') return !r.discarded
    if (filterType === 'discarded') return r.discarded
    return true
  })

  const totalAmount = filtered.reduce((s, r) => s + (r.amount ?? 0), 0)
  const totalCases = filtered.reduce((s, r) => s + (r.caseCount ?? 0), 0)
  const totalDiscarded = filtered.filter((r) => r.discarded).length
  const totalToDepo = filtered.filter((r) => !r.discarded).length

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteDepoReturn(deleteTarget.id)
      addToast('İade geri alındı ✓')
      setDeleteTarget(null)
      load()
    } catch (err) {
      addToast(err.response?.data?.error ?? 'Geri alma başarısız', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <RotateCcw className="w-6 h-6 text-amber-600" />
          İadeler
        </h1>
        <ExportButton
          title="İade Kayıtları"
          filename={`iadeler-${new Date().toISOString().slice(0, 10)}`}
          prepare={() => ({
            columns: ['Tarih', 'Bayi', 'Ürün', 'Kasa', 'Ağırlık (kg)', 'TL/kg', 'Tutar (TL)', 'Durum', 'Zayıf', 'Not', 'Yapan'],
            rows: filtered.map((r) => [
              formatDate(r.createdAt),
              r.market ? `#${r.market.no} ${r.market.name}` : '—',
              r.product?.name ?? '—',
              r.caseCount,
              Number(r.weight).toFixed(2),
              Number(r.pricePerKg).toFixed(2),
              Number(r.amount).toFixed(2),
              r.discarded ? 'Atılan (depoya alınmadı)' : 'Depoya alındı',
              r.weak ? 'Evet' : '',
              r.note ?? '',
              r.createdBy ?? '',
            ]),
          })}
          disabled={!filtered.length}
        />
      </div>

      {/* Özet */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="İade Sayısı" value={filtered.length} />
        <SummaryCard label="Toplam Kasa" value={totalCases} />
        <SummaryCard label="Depoya Alınan" value={totalToDepo} />
        <SummaryCard label="Atılan (Dökülen)" value={totalDiscarded} color="text-error" />
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6 text-sm text-amber-900">
        <strong>Bayi alacağından düşülen toplam tutar:</strong> ₺{fmtTL(totalAmount)}
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {['all', 'depo', 'discarded'].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterType === t ? 'bg-white text-text-primary shadow-card' : 'text-text-muted hover:text-text-primary'}`}
            >
              {t === 'all' ? 'Hepsi' : t === 'depo' ? 'Depoya Alındı' : 'Atılan'}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Bayi</label>
          <select
            value={marketId}
            onChange={(e) => setMarketId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border text-sm bg-white"
          >
            <option value="">Hepsi</option>
            {markets.map((m) => (
              <option key={m.id} value={m.id}>#{m.no} {m.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Başlangıç</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-border text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Bitiş</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 rounded-xl border border-border text-sm" />
        </div>
        {(marketId || dateFrom || dateTo) && (
          <button onClick={() => { setMarketId(''); setDateFrom(''); setDateTo('') }} className="text-xs text-primary hover:underline">Temizle</button>
        )}
      </div>

      {/* Tablo */}
      <div className="bg-white border border-border rounded-2xl shadow-card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" className="text-primary" /></div>
        ) : !filtered.length ? (
          <EmptyState icon="🔄" title="İade kaydı yok" description="Filtreyi değiştir veya depo paneli üzerinden iade kabul et" />
        ) : (
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-gray-50 border-b border-border">
              <tr>
                <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary hidden md:table-cell">Tarih</th>
                <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Bayi</th>
                <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Ürün</th>
                <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">Kasa</th>
                <th className="p-3 text-right font-semibold text-text-secondary hidden sm:table-cell">Ağırlık</th>
                <th className="p-3 text-right font-semibold text-text-secondary hidden lg:table-cell">TL/kg</th>
                <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">Tutar</th>
                <th className="p-2 sm:p-3 text-center font-semibold text-text-secondary">Durum</th>
                <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} className={r.discarded ? 'bg-error/5 hover:bg-error/10' : 'hover:bg-gray-50'}>
                  <td className="p-3 text-text-primary whitespace-nowrap hidden md:table-cell">{formatDate(r.createdAt)}</td>
                  <td className="p-2 sm:p-3 text-text-primary">
                    <div className="flex flex-col">
                      <span>{r.market ? `#${r.market.no} ${r.market.name}` : '—'}</span>
                      <span className="md:hidden text-[10px] text-text-muted">{formatDate(r.createdAt)}</span>
                    </div>
                  </td>
                  <td className="p-2 sm:p-3 font-medium text-text-primary">
                    {r.product?.name ?? '—'}
                    {r.weak && <span className="ml-1 text-[10px] text-error">⚠</span>}
                  </td>
                  <td className="p-2 sm:p-3 text-right tabular-nums font-semibold">{r.caseCount}</td>
                  <td className="p-3 text-right tabular-nums hidden sm:table-cell">{formatWeight(r.weight)}</td>
                  <td className="p-3 text-right tabular-nums hidden lg:table-cell">₺{Number(r.pricePerKg).toFixed(2)}</td>
                  <td className="p-2 sm:p-3 text-right font-semibold text-blue-700 tabular-nums">−₺{fmtTL(r.amount)}</td>
                  <td className="p-2 sm:p-3 text-center">
                    {r.discarded ? (
                      <Badge variant="error" className="inline-flex items-center gap-1 text-[10px]">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Atıldı
                      </Badge>
                    ) : (
                      <Badge variant="success" className="text-[10px]">Depoda</Badge>
                    )}
                  </td>
                  <td className="p-2 sm:p-3 text-right">
                    <button
                      onClick={() => setDeleteTarget(r)}
                      className="p-2 rounded-lg hover:bg-red-50 text-error transition-colors"
                      title="İadeyi geri al (silmiş ol)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="İadeyi Geri Al"
        description={deleteTarget
          ? `${deleteTarget.caseCount} kasa ${deleteTarget.product?.name ?? 'ürün'} iadesi geri alınacak. Bayi borcu, kasa hareketi${deleteTarget.entryId ? ' ve depo girişi' : ''} silinir. Onaylıyor musun?`
          : ''}
        confirmLabel="Evet, Geri Al"
      />
    </div>
  )
}

function SummaryCard({ label, value, color = 'text-text-primary' }) {
  return (
    <div className="bg-white border border-border rounded-2xl p-4 shadow-card">
      <p className="text-xs text-text-muted uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${color}`}>{value}</p>
    </div>
  )
}
