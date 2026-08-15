import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, fetchAllPages } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { MarketAutocomplete } from '@/components/ui/Input'
import { formatDate, formatWeight, formatQty, isCountable, priceLabel, unitLabel, today } from '@/utils/formatters'
import { printIrsaliye, openIrsaliyePdf } from '@/store/printStore'
import { cn } from '@/utils/cn'
import { AlertTriangle, ChevronDown, ChevronRight, FileText, Pencil, Printer, Trash2 } from 'lucide-react'
import { ExportButton } from '@/components/ui/ExportButton'

const TABS = ['İrsaliyeler', 'Giriş Kayıtları']

// --- Excel çıktısı: tek dosya, gruba göre sekmeler ---
// Analiz kolaylığı için: irsaliyeler pazara, girişler bölgeye göre ayrılıyor.
// Tek grup varsa sekme üretmiyoruz — aynı veriyi iki kez yazmanın anlamı yok.
function withSheets(columns, groups) {
  const rows = groups.flatMap((g) => g.rows)
  if (groups.length <= 1) return { columns, rows }
  return {
    columns,
    // rows AÇIKÇA veriliyor: "Tümü" sekmesi PDF çıktısını ve denetim kaydındaki
    // satır sayısını ikiye katlamamalı (bkz. ExportButton).
    rows,
    sheets: [{ name: 'Tümü', columns, rows }, ...groups],
  }
}

// Kalite kolonu kaldırıldı (2026-08-13): özellik kullanımdan kalktı, yeni
// kayıtlarda hep boş kalıyordu. Geçmiş kalite bilgisi veritabanında duruyor.
const EXIT_COLUMNS = ['Tarih', 'Pazar', 'Ürün', 'Kasa', 'Miktar', 'Birim', 'Birim Fiyat (TL)', 'Toplam (TL)']

function buildExitSheets(all) {
  const buckets = new Map() // marketId -> { name, no, rows }
  all.forEach((ex) => {
    const m = ex.market
    const key = m?.id ?? '_yok'
    if (!buckets.has(key)) {
      buckets.set(key, {
        // Ekrandaki etiketle aynı: 0 → Depo, diğerleri "#no ad".
        // Pazar ADLARI unique DEĞİL, no unique — sekmeler no ile ayrışıyor.
        name: m ? (m.no === 0 ? 'Depo' : `#${m.no} ${m.name}`) : 'Pazarsız',
        no: m?.no ?? 9999,
        rows: [],
      })
    }
    const b = buckets.get(key)
    ex.items.forEach((item) => {
      const countable = isCountable(item.entry?.unit)
      b.rows.push([
        formatDate(ex.createdAt),
        `${ex.market?.no ?? ''} ${ex.market?.name ?? ''}`.trim(),
        item.entry?.product?.name ?? '—',
        // Kasa her birimde dolu; miktar ve birim ayrı kolonlarda
        item.entry?.caseCount ?? '',
        item.entry?.weight ? Number(item.entry.weight).toFixed(countable ? 0 : 2) : '',
        unitLabel(item.entry?.unit),
        item.pricePerKg != null ? Number(item.pricePerKg).toFixed(2) : '',
        item.totalPrice != null ? Number(item.totalPrice).toFixed(2) : '',
      ])
    })
  })
  // Pazar no'suna göre — ekrandaki filtre listesi de no sıralı
  const groups = [...buckets.values()].sort((a, b) => a.no - b.no)
  return withSheets(EXIT_COLUMNS, groups.map((g) => ({ name: g.name, columns: EXIT_COLUMNS, rows: g.rows })))
}

// "Depo Transfer" kolonları: mal kabulde DEPO'ya yazılan mal sonradan
// transferle pazara gidiyor. "Pazar" kolonu kaydın ŞU ANKİ yerini gösteriyor,
// oraya nasıl geldiğini değil — bu üç kolon o adımı açıyor.
const ENTRY_COLUMNS = [
  'Tarih', 'Ürün', 'Bölge', 'Üretici', 'Kasa', 'Miktar', 'Birim', 'Pazar',
  'Depo Transfer', 'Transfer Tarihi', 'Transfer Notu',
  'Zayıf', 'Siyah/Karton Kasa',
]

// İade (RETURN) ve imha (DISCARD) girişlerinin bölge oturumu yok → region null.
// Bunlar mal kabul DEĞİL; gerçek bir bölgenin sekmesine karışırsa o bölgenin
// hacmi şişer. Ayrı sekme, en sonda.
const NO_REGION = 'Bölgesiz (İade/İmha)'

// "Evet" tek başına filtrelenebilir bir işaret. Depodan çıkarken gidilen pazar
// kaydın şu anki pazarından FARKLIYSA (sonradan pazar→pazar aktarma yapılmış)
// bunu belirtiyoruz — yoksa o adım kayıtta hiç görünmezdi.
function depoTransferCell(e) {
  const t = e.depoTransfer
  if (!t) return ''
  const hedefNo = t.toMarket?.no
  if (hedefNo == null || hedefNo === e.market?.no) return 'Evet'
  return `Evet (→ #${hedefNo} ${t.toMarket.name})`
}

function buildEntrySheets(all) {
  const buckets = new Map()
  all.forEach((e) => {
    const name = e.region?.name ?? NO_REGION
    if (!buckets.has(name)) buckets.set(name, [])
    buckets.get(name).push([
      formatDate(e.createdAt),
      e.product?.name ?? '—',
      e.region?.name ?? '—',
      e.producer?.name ?? '—',
      e.caseCount,
      e.weight ? Number(e.weight).toFixed(isCountable(e.unit) ? 0 : 2) : '',
      unitLabel(e.unit),
      e.market ? (e.market.no === 0 ? 'Depo' : `#${e.market.no} ${e.market.name}`) : '—',
      // Boş = mal kabulde doğrudan pazara yazılmış, depoya hiç uğramamış.
      // Hedef genelde "Pazar" kolonuyla aynı olduğu için tekrar yazılmıyor;
      // yalnızca sonradan başka pazara aktarıldıysa fark belirtiliyor.
      depoTransferCell(e),
      e.depoTransfer ? formatDate(e.depoTransfer.at) : '',
      // Fire varsa notta: "Tartı farkı: -X kg"
      e.depoTransfer?.note ?? '',
      e.weak ? 'Evet' : '',
      e.disposableCase ? 'Evet' : '',
    ])
  })
  const groups = [...buckets.entries()]
    .sort(([a], [b]) => (a === NO_REGION ? 1 : b === NO_REGION ? -1 : a.localeCompare(b, 'tr')))
    .map(([name, rows]) => ({ name, columns: ENTRY_COLUMNS, rows }))
  return withSheets(ENTRY_COLUMNS, groups)
}

export function HistoryPage() {
  // Dashboard KPI kartları buraya doğrudan sekmeyle giriyor: ?tab=girisler
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('tab') === 'girisler' ? 1 : 0)
  // Tek gün yerine aralık. Varsayılan: bugün–bugün (eski davranışla aynı ekran)
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [data, setData] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const PAGE_SIZE = 50
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(new Set())
  const [editingExit, setEditingExit] = useState(null)
  const [deletingExit, setDeletingExit] = useState(null)
  // Filtreler
  const [filterMarket, setFilterMarket] = useState('')
  const [marketQuery, setMarketQuery] = useState('') // kutuda yazan pazar no
  const [filterRegion, setFilterRegion] = useState('')
  const [filterProducer, setFilterProducer] = useState('')
  // Fiş no ile arama — elindeki fişi tarihini bilmeden bulup tekrar basmak için
  const [filterExitId, setFilterExitId] = useState('')
  const [markets, setMarkets] = useState([])
  const [regions, setRegions] = useState([])
  const [producers, setProducers] = useState([])
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    api.getMarkets().then(setMarkets).catch(() => {})
    api.getAdminRegions().then(setRegions).catch(() => {})
    api.getAdminProducers().then((p) => setProducers(p ?? [])).catch(() => {})
  }, [])

  // Bölge seçilince üretici listesi o bölgeye daralır. allRegions üreticileri
  // her bölgede kalır — tanımları gereği bölgeden bağımsız çalışıyorlar, bölge
  // seçildi diye listeden düşerlerse kayıtları filtreyle hiç bulunamaz.
  const visibleProducers = useMemo(() => {
    const list = producers.filter((p) => p.active)
    if (!filterRegion) return list
    return list.filter((p) => p.allRegions || String(p.regionId) === String(filterRegion))
  }, [producers, filterRegion])

  // Bölge değişince üretici filtresi de sıfırlanır. Effect'le değil burada:
  // seçili üretici yeni bölgenin listesinde yokken filtre ayakta kalırsa
  // sonuçlar görünmeyen bir kritere göre süzülür ve ekran sebepsiz boş görünür.
  function changeRegion(value) {
    setFilterRegion(value)
    setFilterProducer('')
  }

  const exportFilterParams = useCallback(() => {
    // Fiş no verilmişse tek onu getir; tarih/pazar filtresi uygulanmaz
    // (backend de aynı önceliği uyguluyor — bkz. getExitHistory).
    if (tab === 0 && filterExitId) return { exitId: filterExitId }
    const params = {}
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    if (tab === 0 && filterMarket) params.marketId = filterMarket
    if (tab === 1 && filterRegion) params.regionId = filterRegion
    if (tab === 1 && filterProducer) params.producerId = filterProducer
    return params
  }, [tab, dateFrom, dateTo, filterMarket, filterRegion, filterProducer, filterExitId])

  const fetchData = useCallback(() => {
    setLoading(true)
    setData([])
    const params = { ...exportFilterParams(), page, limit: PAGE_SIZE }
    const fn = tab === 0 ? api.getExitHistory : api.getEntryHistory
    fn(params)
      .then((res) => {
        // Backward compat: hem array hem { data, total, hasMore } destekle
        if (Array.isArray(res)) {
          setData(res); setTotal(res.length); setHasMore(false)
        } else {
          setData(res.data ?? []); setTotal(res.total ?? 0); setHasMore(res.hasMore ?? false)
        }
      })
      .catch(() => addToast('Veriler yüklenemedi', 'error'))
      .finally(() => setLoading(false))
  }, [exportFilterParams, tab, page])

  // Filter değişince sayfayı 1'e dön
  useEffect(() => { setPage(1) }, [tab, dateFrom, dateTo, filterMarket, filterRegion, filterProducer, filterExitId])

  useEffect(() => { fetchData() }, [fetchData])

  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text-primary">🔍 Takip & Geçmiş</h1>
        <ExportButton
          title={tab === 0 ? 'İrsaliye Geçmişi' : 'Mal Kabul Geçmişi'}
          filename={`${tab === 0 ? 'irsaliye' : 'mal-kabul'}-${dateFrom === dateTo ? dateFrom : `${dateFrom}_${dateTo}`}`}
          // Ekrandaki sayfa değil, aralığa uyan TÜM kayıtlar. Tarih aralığı
          // gelince bu daha da kritik: kullanıcı bir haftayı export ederken
          // yalnızca ilk 50 satırı almamalı.
          prepare={async () => {
            const all = await fetchAllPages(
              tab === 0 ? api.getExitHistory : api.getEntryHistory,
              exportFilterParams()
            )
            return tab === 0 ? buildExitSheets(all) : buildEntrySheets(all)
          }}
          resource="history"
          disabled={!data.length}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Tab */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => {
                setTab(i)
                setFilterMarket('')
                setFilterRegion('')
                // URL sekmeyi taşısın — yenilemede/paylaşımda aynı sekme açılır
                setSearchParams(i === 1 ? { tab: 'girisler' } : { tab: 'irsaliyeler' }, { replace: true })
              }}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === i ? 'bg-white text-text-primary shadow-card' : 'text-text-muted hover:text-text-primary'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tarih aralığı — diğer admin sayfalarıyla aynı desen */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-text-secondary">Başlangıç</label>
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <label className="text-xs font-medium text-text-secondary">Bitiş</label>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {(dateFrom !== today() || dateTo !== today()) && (
            <button
              type="button"
              onClick={() => { setDateFrom(today()); setDateTo(today()) }}
              className="px-3 py-2 rounded-lg border border-border text-xs font-medium text-text-muted hover:bg-gray-50"
            >
              Bugüne dön
            </button>
          )}
        </div>

        {/* Fiş no ile doğrudan bul — tarih ve pazar filtresini ezer.
            Elindeki fişi tekrar basmak için: no'yu yaz, satırdaki Yazdır'a bas. */}
        {tab === 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-text-secondary">Fiş No</label>
            <input
              type="text"
              inputMode="numeric"
              value={filterExitId}
              onChange={(e) => setFilterExitId(e.target.value.replace(/\D/g, ''))}
              placeholder="örn. 150"
              className="w-28 px-3 py-2.5 rounded-xl border border-border text-sm text-text-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {filterExitId && (
              <button
                type="button"
                onClick={() => setFilterExitId('')}
                className="px-3 py-2 rounded-lg border border-border text-xs font-medium text-text-muted hover:bg-gray-50"
              >
                Temizle
              </button>
            )}
          </div>
        )}

        {/* Pazar filtresi: dropdown yerine NO yazılıyor (diğer ekranlarla aynı
            alışkanlık). Boş bırakılırsa tüm pazarlar.
            Fiş no aramasında anlamsız — gizli. */}
        {tab === 0 && !filterExitId && (
          <div className="flex items-center gap-2">
            <MarketAutocomplete
              label="Pazar No"
              labelClassName="text-xs whitespace-nowrap"
              className="w-24 px-3 py-2.5 text-sm"
              markets={markets}
              value={marketQuery}
              onChange={(v) => {
                setMarketQuery(v)
                if (!v) setFilterMarket('') // kutu boşalınca filtre kalksın
              }}
              onSelect={(m) => setFilterMarket(m?.id ? String(m.id) : '')}
            />
            <span className={`text-xs ${filterMarket ? 'text-primary font-medium' : 'text-text-muted'}`}>
              {marketQuery
                ? (filterMarket
                  ? markets.find((m) => String(m.id) === String(filterMarket))?.name
                  : 'Böyle bir pazar yok')
                : 'Tüm pazarlar'}
            </span>
          </div>
        )}
        {tab === 1 && (
          <>
            <select
              value={filterRegion}
              onChange={(e) => changeRegion(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              <option value="">Tüm Bölgeler</option>
              {regions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            {/* Üretici listesi seçili bölgeye göre daralır (bkz. visibleProducers).
                Filtre backend'de bölgeden bağımsız uygulanır: üreticinin kayıtları
                başka bölge oturumunda da durabiliyor. */}
            <select
              value={filterProducer}
              onChange={(e) => setFilterProducer(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              <option value="">
                {filterRegion ? 'Bu bölgedeki tüm üreticiler' : 'Tüm Üreticiler'}
              </option>
              {visibleProducers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {loading && <div className="flex justify-center py-16"><LoadingSpinner size="lg" className="text-primary" /></div>}
      {!loading && !data.length && <EmptyState icon="📭" title="Bu tarihte kayıt yok" />}

      {!loading && data.length > 0 && tab === 0 && (
        <ExitHistoryTable data={data} expanded={expanded} onToggle={toggleExpand} onEdit={setEditingExit} onDelete={setDeletingExit} />
      )}
      {!loading && data.length > 0 && tab === 1 && (
        <EntryHistoryTable data={data} />
      )}

      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 bg-white border border-border rounded-2xl p-3">
          <span className="text-sm text-text-muted">
            Sayfa <span className="font-semibold text-text-primary">{page}</span> /{' '}
            <span className="font-semibold">{Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
            {' · '}Toplam <span className="font-semibold">{total}</span> kayıt
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Önceki
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore}
              className="px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Sonraki →
            </button>
          </div>
        </div>
      )}

      {editingExit && (
        <EditExitModal
          exit={editingExit}
          onClose={() => setEditingExit(null)}
          onSave={() => { setEditingExit(null); fetchData() }}
        />
      )}

      {deletingExit && (
        <DeleteExitModal
          exit={deletingExit}
          onClose={() => setDeletingExit(null)}
          onDeleted={() => { setDeletingExit(null); fetchData() }}
        />
      )}
    </div>
  )
}

function ExitHistoryTable({ data, expanded, onToggle, onEdit, onDelete }) {
  return (
    <div className="space-y-3">
      {data.map((ex) => (
        <div key={ex.id} className="bg-white border border-border rounded-2xl shadow-card overflow-hidden">
          <button
            onClick={() => onToggle(ex.id)}
            className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
          >
            {expanded.has(ex.id)
              ? <ChevronDown className="w-4 h-4 text-text-muted shrink-0" />
              : <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />}
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div>
                <p className="text-text-muted text-xs">İrsaliye</p>
                <div className="flex items-center gap-1.5">
                  <p className="font-bold text-primary">#{ex.id}</p>
                  {ex.editedAt && <Badge variant="warning" className="text-xs py-0 px-1.5">Düzenlendi</Badge>}
                </div>
              </div>
              <div>
                <p className="text-text-muted text-xs">Pazar</p>
                <p className="font-semibold">#{ex.market?.no} {ex.market?.name}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs">Oluşturan</p>
                <p className="font-medium">{ex.createdBy ?? 'Bilinmiyor'}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs">Tarih</p>
                <p className="text-text-secondary">{formatDate(ex.createdAt)}</p>
              </div>
            </div>
            <div className="flex gap-3 shrink-0 text-sm">
              <span className="text-text-muted">{ex.itemCount} kalem</span>
              <span className="font-semibold">{ex.totalCases} kasa</span>
              <span className="font-semibold">{formatWeight(ex.totalWeight)}</span>
              {ex.totalBunches > 0 && (
                <span className="font-semibold text-primary">{ex.totalBunches} bağ</span>
              )}
              {ex.totalPieces > 0 && (
                <span className="font-semibold text-primary">{ex.totalPieces} adet</span>
              )}
            </div>
          </button>

          {expanded.has(ex.id) && (
            <div className="border-t border-border">
              <div className="px-4 py-2 bg-gray-50 text-xs text-text-muted flex items-center justify-between gap-4">
                <div className="flex gap-4 flex-wrap">
                  <span>Bölgeler: {ex.regions?.join(', ')}</span>
                  {ex.editedAt && (
                    <span className="text-amber-600">
                      Düzenleyen: <strong>{ex.editedBy}</strong> — {formatDate(ex.editedAt)}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => printIrsaliye(ex)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-dark transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" /> Yazdır
                  </button>
                  <button
                    // openIrsaliyePdf: sekmeyi dokunuşun kendisinde açar.
                    // generateIrsaliye tek başına await'ten SONRA açıyordu,
                    // iPad'de popup engeline takılıp sessizce hiçbir şey yapmıyordu.
                    onClick={() => openIrsaliyePdf(ex)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border text-text-secondary rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" /> PDF
                  </button>
                  <button
                    onClick={() => onEdit(ex)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border text-text-secondary rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Düzenle
                  </button>
                  <button
                    onClick={() => onDelete(ex)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-error/40 text-error rounded-lg text-xs font-medium hover:bg-error/5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Sil
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-gray-50 border-b border-border">
                    <tr>
                      <th className="px-2 sm:px-4 py-2 text-left font-semibold text-text-secondary">Ürün</th>
                      <th className="px-4 py-2 text-left font-semibold text-text-secondary hidden lg:table-cell">Bölge</th>
                      <th className="px-2 sm:px-4 py-2 text-right font-semibold text-text-secondary">Kasa</th>
                      <th className="px-4 py-2 text-right font-semibold text-text-secondary hidden sm:table-cell">Miktar</th>
                      <th className="px-4 py-2 text-right font-semibold text-text-secondary hidden md:table-cell">Birim Fiyat</th>
                      <th className="px-2 sm:px-4 py-2 text-right font-semibold text-text-secondary">Tutar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ex.items.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-2 sm:px-4 py-2">
                          <div className="flex flex-col">
                            <span>{item.entry?.product?.name ?? '—'}</span>
                            <span className="lg:hidden text-[10px] text-text-muted">{item.entry?.regionSession?.region?.name ?? '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-text-secondary hidden lg:table-cell">{item.entry?.regionSession?.region?.name ?? '—'}</td>
                        <td className="px-2 sm:px-4 py-2 text-right tabular-nums">
                          {item.entry?.caseCount}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums hidden sm:table-cell">
                          {formatQty(item.entry?.weight, item.entry?.unit)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums hidden md:table-cell">
                          {item.pricePerKg != null
                            ? `₺${Number(item.pricePerKg).toFixed(2)} ${priceLabel(item.entry?.unit).replace('₺', '')}`
                            : '—'}
                        </td>
                        <td className="px-2 sm:px-4 py-2 text-right font-medium tabular-nums">{item.totalPrice != null ? `₺${Number(item.totalPrice).toFixed(2)}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {ex.items.some((i) => i.totalPrice != null) && (
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-2 sm:px-4 py-2" colSpan={6}>Toplam Tutar</td>
                        <td className="px-2 sm:px-4 py-2 text-right text-primary tabular-nums">
                          ₺{ex.items.reduce((s, i) => s + (i.totalPrice ?? 0), 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// İrsaliye silme onayı. Silme geri alınamaz olduğu için ne olacağı tek tek
// yazılıyor: mal kaybolmuyor, depoya dönüyor — kullanıcı bunu bilmeden basmasın.
function DeleteExitModal({ exit, onClose, onDeleted }) {
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState('')
  const [deleting, setDeleting] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    api.getAdminUsers().then(setUsers).catch(() => addToast('Kullanıcılar yüklenemedi', 'error'))
  }, [])

  async function handleDelete() {
    if (!selectedUser) { addToast('Silen kullanıcı seçilmeli', 'error'); return }
    setDeleting(true)
    try {
      const res = await api.deleteExit(exit.id, { deletedBy: selectedUser })
      const geri = res?.returnedToDepo
      addToast(
        geri > 0
          ? `İrsaliye #${exit.id} silindi — ${geri} kalem depoya döndü ✓`
          : `İrsaliye #${exit.id} silindi ✓`
      )
      onDeleted()
    } catch (err) {
      addToast(err.response?.data?.error ?? 'Silme başarısız', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`İrsaliye #${exit.id} Sil`}>
      <div className="flex flex-col gap-4">
        <div className="bg-error/5 border border-error/20 rounded-xl p-3 flex gap-2.5">
          <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
          <div className="text-sm text-text-secondary space-y-1">
            <p className="font-semibold text-text-primary">
              #{exit.market?.no} {exit.market?.name} — {exit.itemCount} kalem · {exit.totalCases} kasa · {formatWeight(exit.totalWeight)}
              {exit.totalBunches > 0 && ` · ${exit.totalBunches} bağ`}
              {exit.totalPieces > 0 && ` · ${exit.totalPieces} adet`}
            </p>
            <p>Bu işlem geri alınamaz. Silindiğinde:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Bayinin bu irsaliyeden doğan borcu silinir</li>
              <li>Kasa hareketi geri alınır</li>
              <li>Mal <strong>depoya döner</strong>, transfer geçmişine not düşülür</li>
            </ul>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-text-secondary block mb-1.5">Silen</label>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          >
            <option value="">— Kullanıcı seçin —</option>
            {users.filter((u) => u.active).map((u) => (
              <option key={u.id} value={u.name}>{u.name}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 justify-end pt-1">
          <Button variant="outline" onClick={onClose} disabled={deleting}>Vazgeç</Button>
          <Button
            onClick={handleDelete}
            loading={deleting}
            disabled={!selectedUser}
            variant="danger"
          >
            İrsaliyeyi Sil
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function EditExitModal({ exit, onClose, onSave }) {
  const [available, setAvailable] = useState([])
  const [users, setUsers] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [selected, setSelected] = useState(() => new Set(exit.items.map((i) => i.entry.id)))
  const [selectedUser, setSelectedUser] = useState('')
  // Fiyat artık ürün başına tek (kalite kullanımdan kalktı) — anahtar productId.
  const [prices, setPrices] = useState(() => {
    const p = {}
    exit.items.forEach((item) => {
      if (item.pricePerKg != null) p[item.entry.productId] = String(item.pricePerKg)
    })
    return p
  })
  const [saving, setSaving] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    Promise.all([api.getMarketEntries(exit.market.id), api.getAdminUsers()])
      .then(([avail, userList]) => { setAvailable(avail); setUsers(userList) })
      .catch(() => addToast('Veriler yüklenemedi', 'error'))
      .finally(() => setLoadingData(false))
  }, [])

  const currentEntries = exit.items.map((i) => ({ ...i.entry, _inExit: true }))
  const currentIds = new Set(currentEntries.map((e) => e.id))
  const allEntries = [
    ...currentEntries,
    ...available.filter((e) => !currentIds.has(e.id)).map((e) => ({ ...e, _inExit: false })),
  ]

  // Fiyat düzenlemesi ürün başına tek satır. Eskiden ürün+kalite kombinasyonuydu;
  // kalite kullanımdan kalkınca aynı ürün için iki satır çıkıp hangisinin
  // geçerli olduğu belirsizleşiyordu.
  const priceRows = []
  const seen = new Set()
  allEntries.forEach((e) => {
    const key = String(e.productId)
    if (!seen.has(key)) {
      seen.add(key)
      priceRows.push({
        key, productId: e.productId,
        productName: e.product?.name,
        unit: e.unit, // ₺/kg · ₺/bağ · ₺/adet — muhasebeci hangi birime yazdığını görmeli
      })
    }
  })

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSave() {
    if (!selected.size) { addToast('En az bir giriş seçilmeli', 'error'); return }
    if (!selectedUser) { addToast('Düzenleyen kullanıcı seçilmeli', 'error'); return }
    setSaving(true)
    try {
      // Önce fiyatları kaydet
      const exitDate = exit.createdAt.split('T')[0]
      await Promise.all(
        priceRows
          .filter((r) => prices[r.key] && Number(prices[r.key]) > 0)
          .map((r) => api.upsertPrice({
            productId: r.productId,
            // qualityId gönderilmiyor → ürünün genel fiyatı yazılır
            pricePerKg: Number(prices[r.key]),
            date: exitDate,
            updatedBy: selectedUser,
          }))
      )
      // Sonra exit güncelle
      await api.updateExit(exit.id, { entryIds: [...selected], editedBy: selectedUser })
      addToast('İrsaliye güncellendi ✓')
      onSave()
    } catch (err) {
      addToast(err.response?.data?.error ?? 'Güncelleme başarısız', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`İrsaliye #${exit.id} Düzenle`} className="max-w-2xl">
      {loadingData ? (
        <div className="flex justify-center py-8"><LoadingSpinner className="text-primary" /></div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Düzenleyen kullanıcı */}
          <div>
            <label className="text-sm font-medium text-text-secondary block mb-1.5">Düzenleyen</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              <option value="">— Kullanıcı seçin —</option>
              {users.filter((u) => u.active).map((u) => (
                <option key={u.id} value={u.name}>{u.name}</option>
              ))}
            </select>
          </div>

          {/* Giriş seçimi */}
          <div>
            <label className="text-sm font-medium text-text-secondary block mb-1.5">
              #{exit.market?.no} {exit.market?.name} — Dahil Edilecek Girişler
            </label>
            <div className="border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-gray-50 border-b border-border">
                  <tr>
                    <th className="p-2 sm:p-3 w-10"></th>
                    <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Ürün</th>
                    <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">Kasa</th>
                    <th className="p-3 text-right font-semibold text-text-secondary hidden sm:table-cell">Miktar</th>
                    <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allEntries.map((entry) => (
                    <tr
                      key={entry.id}
                      onClick={() => toggle(entry.id)}
                      className={cn('cursor-pointer transition-colors', selected.has(entry.id) ? 'bg-primary-light/40' : 'hover:bg-gray-50')}
                    >
                      <td className="p-2 sm:p-3 text-center">
                        <input
                          type="checkbox"
                          checked={selected.has(entry.id)}
                          onChange={() => toggle(entry.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded accent-primary"
                        />
                      </td>
                      <td className="p-2 sm:p-3 font-medium">
                        <div className="flex flex-col">
                          <span>{entry.product?.name ?? '—'}</span>
                          <span className="sm:hidden text-[10px] text-text-muted">{formatQty(entry.weight, entry.unit)}</span>
                        </div>
                      </td>
                      <td className="p-2 sm:p-3 text-right tabular-nums">
                        {entry.caseCount}
                      </td>
                      <td className="p-3 text-right tabular-nums hidden sm:table-cell">
                        {formatQty(entry.weight, entry.unit)}
                      </td>
                      <td className="p-2 sm:p-3">
                        {entry._inExit
                          ? <span className="text-[10px] sm:text-xs text-primary font-medium">Bu irsaliyede</span>
                          : <span className="text-[10px] sm:text-xs text-text-muted">Bekliyor</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Fiyat düzenleme */}
          {priceRows.length > 0 && (
            <div>
              {/* Birim ürüne göre değişiyor (₺/kg · ₺/bağ · ₺/adet) — satır bazında yazılı */}
              <label className="text-sm font-medium text-text-secondary block mb-1.5">Fiyat Güncelle</label>
              <div className="grid grid-cols-2 gap-2">
                {priceRows.map((row) => (
                  <div key={row.key} className="flex items-center gap-2 bg-gray-50 rounded-xl p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate">{row.productName}</p>
                      <span className="text-[10px] text-text-muted">{priceLabel(row.unit)}</span>
                    </div>
                    <div className="relative w-24 shrink-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted text-xs">₺</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="—"
                        value={prices[row.key] ?? ''}
                        onChange={(e) => setPrices((prev) => ({ ...prev, [row.key]: e.target.value }))}
                        className="w-full pl-6 pr-2 py-2 rounded-lg border border-border text-right text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={onClose}>İptal</Button>
            <Button onClick={handleSave} loading={saving} disabled={!selected.size || !selectedUser}>
              Kaydet ({selected.size} giriş)
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function EntryHistoryTable({ data }) {
  return (
    <div className="bg-white border border-border rounded-2xl shadow-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-border">
          <tr>
            <th className="p-4 text-left font-semibold text-text-secondary">Bölge</th>
            <th className="p-4 text-left font-semibold text-text-secondary">Üretici</th>
            <th className="p-4 text-left font-semibold text-text-secondary">Ürün</th>
            <th className="p-4 text-left font-semibold text-text-secondary">Mal Durumu</th>
            <th className="p-4 text-left font-semibold text-text-secondary">Pazar</th>
            <th className="p-4 text-right font-semibold text-text-secondary">Kasa</th>
            <th className="p-4 text-right font-semibold text-text-secondary">Miktar</th>
            <th className="p-4 text-left font-semibold text-text-secondary">Giriş</th>
            <th className="p-4 text-left font-semibold text-text-secondary">İrsaliye</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((e) => (
            <tr key={e.id} className={cn('hover:bg-gray-50 transition-colors', e.weak && 'bg-error/5')}>
              <td className="p-4 font-medium text-text-primary">{e.region?.name ?? '—'}</td>
              <td className="p-4 text-text-secondary">{e.producer?.name ?? '—'}</td>
              <td className="p-4 text-text-primary">{e.product?.name ?? '—'}</td>
              <td className="p-4">
                <div className="flex flex-col items-start gap-1">
                  {e.weak
                    ? <Badge variant="error" className="font-semibold">⚠ Zayıf</Badge>
                    : <Badge variant="success">Normal</Badge>}
                  {e.disposableCase && <Badge variant="default">Siyah/Karton Kasa</Badge>}
                </div>
              </td>
              <td className="p-4 text-text-secondary">#{e.market?.no} {e.market?.name}</td>
              <td className="p-4 text-right">{e.caseCount}</td>
              <td className="p-4 text-right">{formatQty(e.weight, e.unit)}</td>
              <td className="p-4 text-xs text-text-muted">{formatDate(e.createdAt)}</td>
              <td className="p-4">
                {e.irsaliyeId
                  ? <Badge variant="success">#{e.irsaliyeId}</Badge>
                  : <Badge variant="warning">Bekliyor</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
