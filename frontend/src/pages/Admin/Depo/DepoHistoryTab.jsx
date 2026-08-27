import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, asList, errorMessage, fetchAllPages } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Segmented } from '@/components/ui/Segmented'
import { Pagination } from '@/components/ui/Pagination'
import { ExportButton } from '@/components/ui/ExportButton'
import { formatDate, formatQty, formatWeight, today, unitLabel } from '@/utils/formatters'
import { ArrowDownLeft, ArrowUpRight, Search, AlertTriangle, Package } from 'lucide-react'

const PAGE_SIZE = 50

const DIRECTIONS = [
  { value: 'ALL', label: 'Hepsi' },
  { value: 'IN', label: 'Girişler' },
  { value: 'OUT', label: 'Çıkışlar' },
]

// Hareket tipi → ekran etiketi. Backend makine adı gönderiyor, metin burada:
// aynı tip export'ta ve tabloda tek yerden okunsun.
const TYPE_LABEL = {
  INTAKE: 'Mal Kabul',
  MANUAL: 'Elle Giriş',
  RETURN: 'İade',
  TRANSFER_IN: 'Transferle Geldi',
  TRANSFER_OUT: 'Transfer',
  DISCARD: 'İmha',
}

const TYPE_VARIANT = {
  INTAKE: 'success',
  MANUAL: 'default',
  RETURN: 'warning',
  TRANSFER_IN: 'primary',
  TRANSFER_OUT: 'primary',
  DISCARD: 'error',
}

// Hareketin karşı tarafı: girişte nereden geldiği, çıkışta nereye gittiği.
function counterparty(r) {
  if (r.direction === 'OUT') return r.toMarket ?? '—'
  if (r.type === 'TRANSFER_IN') return r.fromMarket ?? '—'
  return r.regionName ?? r.producerName ?? '—'
}

export function DepoHistoryTab() {
  // Filtreler TEK state: her değişimde sayfa 1'e dönmeli ve bunu ayrı bir
  // effect'e bırakmak (setPage'i effect içinde çağırmak) hem cascading render
  // üretiyor hem de bir tık boyunca eski sayfayı yeni filtreyle sorguluyor.
  //
  // Aralık açıkça bugüne kuruluyor — backend filtresiz istekte de bugünü döner
  // ama kullanıcı hangi günü gördüğünü input'ta görmeli.
  const [filters, setFilters] = useState({
    dateFrom: today(), dateTo: today(), direction: 'ALL', query: '',
  })
  const { dateFrom, dateTo, direction, query } = filters
  const [page, setPage] = useState(1)
  const patch = (p) => { setFilters((f) => ({ ...f, ...p })); setPage(1) }
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const addToast = useToastStore((s) => s.addToast)

  const filterParams = useCallback(() => {
    const p = {}
    if (dateFrom) p.dateFrom = dateFrom
    if (dateTo) p.dateTo = dateTo
    if (direction !== 'ALL') p.direction = direction
    if (query.trim()) p.q = query.trim()
    return p
  }, [dateFrom, dateTo, direction, query])

  const load = useCallback(() => {
    setLoading(true)
    api.getAdminDepoHistory({ ...filterParams(), page, limit: PAGE_SIZE })
      .then((res) => {
        setRows(asList(res))
        setTotal(res?.total ?? 0)
        setHasMore(res?.hasMore ?? false)
        setSummary(res?.summary ?? null)
        setTruncated(!!res?.truncated)
      })
      .catch((err) => addToast(errorMessage(err, 'Depo geçmişi yüklenemedi'), 'error'))
      .finally(() => setLoading(false))
  }, [filterParams, page, addToast])

  // Arama her tuşta istek atmasın; tarih/yön değişimi anında gitsin.
  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, query])

  const exportPrepare = useMemo(() => async () => ({
    columns: ['Tarih', 'Yön', 'Hareket', 'Ürün', 'Kasa', 'Miktar', 'Birim', 'Karşı Taraf', 'Üretici', 'Yapan', 'Not'],
    // Ekrandaki sayfa değil, filtreye uyan TÜM kayıtlar indirilir
    rows: (await fetchAllPages(api.getAdminDepoHistory, filterParams())).map((r) => [
      formatDate(r.at),
      r.direction === 'IN' ? 'Giriş' : 'Çıkış',
      TYPE_LABEL[r.type] ?? r.type,
      r.productName,
      r.caseCount,
      r.weight,
      unitLabel(r.unit),
      counterparty(r),
      r.producerName ?? '',
      r.by ?? '',
      r.note ?? '',
    ]),
  }), [filterParams])

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Başlangıç</label>
          <input
            type="date" value={dateFrom} onChange={(e) => patch({ dateFrom: e.target.value })}
            className="px-3 py-2 rounded-xl border border-border text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Bitiş</label>
          <input
            type="date" value={dateTo} onChange={(e) => patch({ dateTo: e.target.value })}
            className="px-3 py-2 rounded-xl border border-border text-sm"
          />
        </div>
        <Segmented value={direction} onChange={(v) => patch({ direction: v })} options={DIRECTIONS} className="w-fit" size="sm" />
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(e) => patch({ query: e.target.value })}
            placeholder="Ürün, kişi, bölge veya pazar ara…"
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="ml-auto">
          <ExportButton
            title="Depo Hareket Geçmişi"
            subtitle={`${dateFrom || '…'} → ${dateTo || '…'}`}
            filename={`depo-gecmis-${dateFrom || today()}`}
            resource="depo-history"
            prepare={exportPrepare}
            disabled={!total}
          />
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <MovementCard
            label="Depoya Giren" tone="in" icon={ArrowDownLeft} data={summary.in}
          />
          <MovementCard
            label="Depodan Çıkan" tone="out" icon={ArrowUpRight} data={summary.out}
          />
        </div>
      )}

      {truncated && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Seçilen aralıkta çok fazla hareket var, liste kırpıldı. Özet ve toplamlar
          eksik olabilir — tarih aralığını daralt.
        </div>
      )}

      <div className="bg-white border border-border rounded-2xl shadow-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" className="text-primary" /></div>
        ) : !rows.length ? (
          <EmptyState
            icon="🕘"
            title="Bu aralıkta depo hareketi yok"
            description="Mal kabulde DEPO seçilen girişler, elle girişler, iadeler ve depo transferleri burada listelenir."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary hidden md:table-cell">Tarih</th>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Hareket</th>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Ürün</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">Kasa</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">Miktar</th>
                  <th className="p-3 text-left font-semibold text-text-secondary hidden lg:table-cell">Karşı Taraf</th>
                  <th className="p-3 text-left font-semibold text-text-secondary">Yapan</th>
                  <th className="p-3 text-left font-semibold text-text-secondary hidden xl:table-cell">Not</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className={r.direction === 'OUT' ? 'hover:bg-gray-50' : 'bg-green-50/40 hover:bg-green-50'}>
                    <td className="p-3 whitespace-nowrap text-text-primary hidden md:table-cell">{formatDate(r.at)}</td>
                    <td className="p-2 sm:p-3">
                      <div className="flex flex-col gap-1 items-start">
                        <Badge variant={TYPE_VARIANT[r.type] ?? 'default'} className="inline-flex items-center gap-1 whitespace-nowrap">
                          {r.direction === 'IN'
                            ? <ArrowDownLeft className="w-3 h-3" />
                            : <ArrowUpRight className="w-3 h-3" />}
                          {TYPE_LABEL[r.type] ?? r.type}
                        </Badge>
                        <span className="md:hidden text-[10px] text-text-muted">{formatDate(r.at)}</span>
                      </div>
                    </td>
                    <td className="p-2 sm:p-3 font-medium text-text-primary">
                      <div className="flex flex-col gap-0.5">
                        <span>{r.productName}</span>
                        <div className="flex gap-1 flex-wrap">
                          {r.weak && (
                            <Badge variant="error" className="inline-flex items-center gap-1 text-[10px]">
                              <AlertTriangle className="w-2.5 h-2.5" />Zayıf
                            </Badge>
                          )}
                          {r.disposableCase && (
                            <Badge variant="default" className="inline-flex items-center gap-1 text-[10px]">
                              <Package className="w-2.5 h-2.5" />Siyah Kasa
                            </Badge>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-2 sm:p-3 text-right tabular-nums">{r.caseCount}</td>
                    <td className="p-2 sm:p-3 text-right tabular-nums font-semibold text-primary">
                      {formatQty(r.weight, r.unit)}
                    </td>
                    <td className="p-3 text-text-secondary hidden lg:table-cell">{counterparty(r)}</td>
                    <td className="p-3 text-text-muted whitespace-nowrap">{r.by ?? '—'}</td>
                    <td className="p-3 text-xs text-text-muted max-w-xs truncate hidden xl:table-cell">{r.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} hasMore={hasMore} onChange={setPage} />
    </div>
  )
}

// Giriş/çıkış özeti. Bağ ve adet AYRI gösterilir — farklı eksenler, toplanamaz.
function MovementCard({ label, tone, icon: Icon, data }) {
  const inbound = tone === 'in'
  return (
    <div className={`border rounded-2xl p-4 shadow-card ${inbound ? 'bg-green-50 border-green-200' : 'bg-white border-border'}`}>
      <p className="text-xs uppercase tracking-wide flex items-center gap-1.5 font-semibold text-text-secondary">
        <Icon className={`w-4 h-4 ${inbound ? 'text-green-600' : 'text-primary'}`} />
        {label}
      </p>
      <p className="text-2xl font-bold text-text-primary mt-1 tabular-nums">{data.count} hareket</p>
      <div className="text-xs text-text-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
        <span>{data.cases} kasa</span>
        {data.weight > 0 && <span>{formatWeight(data.weight)}</span>}
        {data.bunches > 0 && <span>{data.bunches} bağ</span>}
        {data.pieces > 0 && <span>{data.pieces} adet</span>}
      </div>
    </div>
  )
}
