import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { today } from '@/utils/formatters'
import { cn } from '@/utils/cn'
import { ExportButton } from '@/components/ui/ExportButton'

const TABS = ['Günlük Özet', 'Pazara Göre', 'Ürüne Göre', 'En Çok Satılan']

export function ReportsPage() {
  const [tab, setTab] = useState(0)
  const [date, setDate] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    setData(null)
    try {
      if (tab === 0) setData(await api.getDailyReport(date))
      if (tab === 1) setData(await api.getByMarketReport(date))
      if (tab === 2) setData(await api.getByProductReport(date))
      if (tab === 3) setData(await api.getTopProducts(7, 20))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [tab, date])

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-text-primary mb-6">📈 Raporlar</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === i ? 'bg-white text-text-primary shadow-card' : 'text-text-muted hover:text-text-primary'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Date picker (not for top-products tab) */}
      {tab < 3 && (
        <div className="mb-6">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" className="text-primary" /></div>
      )}

      {!loading && data && tab === 0 && <DailyView data={data} />}
      {!loading && data && tab === 1 && <MarketView data={data} />}
      {!loading && data && tab === 2 && <ProductView data={data} />}
      {!loading && data && tab === 3 && <TopView data={data} />}
    </div>
  )
}

function StatBox({ label, value, unit }) {
  return (
    <div className="bg-white border border-border rounded-2xl p-5 shadow-card">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="text-3xl font-bold text-text-primary mt-1">
        {value ?? '-'}{unit && <span className="text-base font-normal text-text-muted ml-1">{unit}</span>}
      </p>
    </div>
  )
}

function DailyView({ data }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatBox label="Giriş Kaydı" value={data.totalEntries} />
      <StatBox label="Toplam Kasa" value={data.totalCases} />
      <StatBox label="Toplam Ağırlık" value={data.totalWeight?.toFixed(1)} unit="kg" />
      <StatBox label="İrsaliye" value={data.totalExits} />
    </div>
  )
}

function MarketView({ data }) {
  if (!data.length) return <p className="text-text-muted">Bu tarihte veri yok</p>
  return (
    <DataTable
      title="Pazar Bazlı Rapor"
      columns={['Pazar No', 'Pazar Adı', 'Kasa', 'Ağırlık']}
      rows={data.map((d) => [
        `#${d.market.no}`,
        d.market.name,
        d.totalCases,
        `${d.totalWeight.toFixed(1)} kg`,
      ])}
    />
  )
}

function ProductView({ data }) {
  if (!data.length) return <p className="text-text-muted">Bu tarihte veri yok</p>
  return (
    <DataTable
      title="Ürün Bazlı Rapor"
      columns={['Ürün', 'Giriş Sayısı', 'Kasa', 'Ağırlık']}
      rows={data.map((d) => [
        d.product?.name ?? '—',
        d.totalEntries,
        d.totalCases,
        `${Number(d.totalWeight ?? 0).toFixed(1)} kg`,
      ])}
    />
  )
}

function TopView({ data }) {
  if (!data.length) return <p className="text-text-muted">Son 7 günde veri yok</p>
  return (
    <DataTable
      title="En Çok Giriş Yapılan Ürünler"
      columns={['Sıra', 'Ürün', 'Giriş Sayısı', 'Kasa', 'Ağırlık (7 gün)']}
      rows={data.map((d, i) => [
        `#${i + 1}`,
        d.product?.name ?? '—',
        d.totalEntries,
        d.totalCases,
        `${Number(d.totalWeight ?? 0).toFixed(1)} kg`,
      ])}
    />
  )
}

function DataTable({ columns, rows, title = 'Rapor' }) {
  return (
    <div className="bg-white border border-border rounded-2xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-border bg-gray-50">
        <span className="text-sm font-semibold text-text-secondary">{title}</span>
        <ExportButton
          title={title}
          filename={`${title}-${new Date().toISOString().slice(0, 10)}`}
          prepare={() => ({ columns, rows })}
          disabled={!rows.length}
        />
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead className="bg-gray-50 border-b border-border">
          <tr>
            {columns.map((c, i) => (
              <th
                key={c}
                className={`p-2 sm:p-4 text-left font-semibold text-text-secondary ${i > 1 ? 'hidden md:table-cell' : ''}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50 transition-colors">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`p-2 sm:p-4 text-text-primary ${j > 1 ? 'hidden md:table-cell' : ''}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
