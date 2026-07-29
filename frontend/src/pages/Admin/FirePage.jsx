import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from '@/services/api'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ExportButton } from '@/components/ui/ExportButton'
import { formatWeight } from '@/utils/formatters'
import { Trash } from 'lucide-react'

const fmtTL = (n) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(Number(n)))

// 99 = ATILAN pazarına yazılan mallar. İki kaynaktan gelir:
// bayiden iade → imha, veya depodaki malın 99'a transferi (fire).
export function FirePage() {
  const [data, setData] = useState({ items: [], totals: { cases: 0, weight: 0, amount: 0 } })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = useCallback(() => {
    const params = {}
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    return api.getFireReport(params)
      .then((res) => { setData(res); setError('') })
      .catch((err) => setError(errorMessage(err, 'Fire raporu yüklenemedi')))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo])

  // setState'ler async callback'lerde — effect gövdesinde senkron setState
  // cascading render tetikliyor (bkz. react-hooks/set-state-in-effect)
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => { if (alive) load() }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [load])

  const { items, totals } = data

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <Trash className="w-6 h-6 text-error" />
          Fire / İmha Raporu
        </h1>
        <ExportButton
          title="Fire Raporu"
          filename={`fire-${dateFrom || 'tum'}-${dateTo || 'zaman'}`}
          prepare={() => ({
            columns: ['Ürün', 'Kayıt', 'Kasa', 'Ağırlık (kg)', 'Tutar (TL)'],
            rows: items.map((i) => [
              i.product?.name ?? '—',
              i.entryCount,
              i.totalCases,
              Number(i.totalWeight).toFixed(2),
              Number(i.amount).toFixed(2),
            ]),
          })}
          disabled={!items.length}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <SummaryCard label="Toplam Kasa" value={totals.cases} color="text-error" />
        <SummaryCard label="Toplam Ağırlık" value={formatWeight(totals.weight)} color="text-error" />
        <SummaryCard label="Bayi Alacağından Düşen" value={`₺${fmtTL(totals.amount)}`} />
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Başlangıç</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border text-sm bg-white"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Bitiş</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border text-sm bg-white"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo('') }}
            className="px-3 py-2 text-xs text-text-muted hover:text-text-primary"
          >
            Temizle
          </button>
        )}
      </div>

      {error && <p className="text-sm text-error mb-4">{error}</p>}

      {loading ? (
        <LoadingSpinner />
      ) : !items.length ? (
        <EmptyState title="Fire kaydı yok" description="Seçilen aralıkta imha edilen mal bulunmuyor." />
      ) : (
        <div className="bg-white border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-text-muted text-xs uppercase tracking-wide">
                <tr>
                  <th className="p-3 text-left">Ürün</th>
                  <th className="p-3 text-right">Kayıt</th>
                  <th className="p-3 text-right">Kasa</th>
                  <th className="p-3 text-right">Ağırlık</th>
                  <th className="p-3 text-right">Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((i, idx) => (
                  // Math.random() key olamaz: her render'da değişir, React satırı
                  // yeniden mount eder. Ürünsüz satır için sıra numarası kararlı.
                  <tr key={i.product?.id ?? `row-${idx}`} className="hover:bg-gray-50">
                    <td className="p-3 font-medium text-text-primary">
                      {i.product?.icon && <span className="mr-1">{i.product.icon}</span>}
                      {i.product?.name ?? '—'}
                    </td>
                    <td className="p-3 text-right tabular-nums text-text-muted">{i.entryCount}</td>
                    <td className="p-3 text-right tabular-nums font-semibold">{i.totalCases}</td>
                    <td className="p-3 text-right tabular-nums">{formatWeight(i.totalWeight)}</td>
                    <td className="p-3 text-right tabular-nums text-blue-700 font-semibold">
                      {i.amount > 0 ? `−₺${fmtTL(i.amount)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
