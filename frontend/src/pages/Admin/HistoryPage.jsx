import { useCallback, useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { formatDate, formatWeight, today } from '@/utils/formatters'
import { generateIrsaliye } from '@/utils/pdfGenerator'
import { cn } from '@/utils/cn'
import { ChevronDown, ChevronRight, FileText, Pencil } from 'lucide-react'
import { ExportButton } from '@/components/ui/ExportButton'

const TABS = ['İrsaliyeler', 'Giriş Kayıtları']

export function HistoryPage() {
  const [tab, setTab] = useState(0)
  const [date, setDate] = useState(today())
  const [data, setData] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const PAGE_SIZE = 50
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(new Set())
  const [editingExit, setEditingExit] = useState(null)
  // Filtreler
  const [filterMarket, setFilterMarket] = useState('')
  const [filterDriver, setFilterDriver] = useState('')
  const [markets, setMarkets] = useState([])
  const [drivers, setDrivers] = useState([])
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    api.getMarkets().then(setMarkets).catch(() => {})
    api.getAdminDrivers().then(setDrivers).catch(() => {})
  }, [])

  const fetchData = useCallback(() => {
    setLoading(true)
    setData([])
    const params = { date, page, limit: PAGE_SIZE }
    if (tab === 0 && filterMarket) params.marketId = filterMarket
    if (tab === 1 && filterDriver) params.driverId = filterDriver
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
  }, [tab, date, filterMarket, filterDriver, page])

  // Filter değişince sayfayı 1'e dön
  useEffect(() => { setPage(1) }, [tab, date, filterMarket, filterDriver])

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
          filename={`${tab === 0 ? 'irsaliye' : 'mal-kabul'}-${date}`}
          prepare={() => {
            if (tab === 0) {
              const rows = []
              data.forEach((ex) => {
                ex.items.forEach((item) => {
                  rows.push([
                    formatDate(ex.createdAt),
                    `${ex.market?.no ?? ''} ${ex.market?.name ?? ''}`.trim(),
                    item.entry?.product?.name ?? '—',
                    item.entry?.quality?.name ?? '',
                    item.entry?.caseCount ?? '',
                    item.entry?.weight ? Number(item.entry.weight).toFixed(2) : '',
                    item.pricePerKg != null ? Number(item.pricePerKg).toFixed(2) : '',
                    item.totalPrice != null ? Number(item.totalPrice).toFixed(2) : '',
                  ])
                })
              })
              return {
                columns: ['Tarih', 'Pazar', 'Ürün', 'Kalite', 'Kasa', 'Ağırlık (kg)', 'TL/kg', 'Toplam (TL)'],
                rows,
              }
            } else {
              return {
                columns: ['Tarih', 'Ürün', 'Kalite', 'Şoför', 'Üretici', 'Kasa', 'Ağırlık (kg)', 'Pazar', 'Zayıf'],
                rows: data.map((e) => [
                  formatDate(e.createdAt),
                  e.product?.name ?? '—',
                  e.quality?.name ?? '',
                  e.vehicleSession?.driver?.name ?? '—',
                  e.producer?.name ?? '—',
                  e.caseCount,
                  e.weight ? Number(e.weight).toFixed(2) : '',
                  e.market ? (e.market.no === 0 ? 'Depo' : `#${e.market.no} ${e.market.name}`) : '—',
                  e.weak ? 'Evet' : '',
                ]),
              }
            }
          }}
          disabled={!data.length}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Tab */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => { setTab(i); setFilterMarket(''); setFilterDriver('') }}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === i ? 'bg-white text-text-primary shadow-card' : 'text-text-muted hover:text-text-primary'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tarih */}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
        />

        {/* Tab'a göre filtre */}
        {tab === 0 && (
          <select
            value={filterMarket}
            onChange={(e) => setFilterMarket(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          >
            <option value="">Tüm Pazarlar</option>
            {markets.map((m) => (
              <option key={m.id} value={m.id}>#{m.no} {m.name}</option>
            ))}
          </select>
        )}
        {tab === 1 && (
          <select
            value={filterDriver}
            onChange={(e) => setFilterDriver(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          >
            <option value="">Tüm Şoförler</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
      </div>

      {loading && <div className="flex justify-center py-16"><LoadingSpinner size="lg" className="text-primary" /></div>}
      {!loading && !data.length && <EmptyState icon="📭" title="Bu tarihte kayıt yok" />}

      {!loading && data.length > 0 && tab === 0 && (
        <ExitHistoryTable data={data} expanded={expanded} onToggle={toggleExpand} onEdit={setEditingExit} />
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
    </div>
  )
}

function ExitHistoryTable({ data, expanded, onToggle, onEdit }) {
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
            </div>
          </button>

          {expanded.has(ex.id) && (
            <div className="border-t border-border">
              <div className="px-4 py-2 bg-gray-50 text-xs text-text-muted flex items-center justify-between gap-4">
                <div className="flex gap-4 flex-wrap">
                  <span>Şoförler: {ex.drivers?.join(', ')}</span>
                  {ex.editedAt && (
                    <span className="text-amber-600">
                      Düzenleyen: <strong>{ex.editedBy}</strong> — {formatDate(ex.editedAt)}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => generateIrsaliye(ex)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-dark transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" /> PDF
                  </button>
                  <button
                    onClick={() => onEdit(ex)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border text-text-secondary rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Düzenle
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-gray-50 border-b border-border">
                    <tr>
                      <th className="px-2 sm:px-4 py-2 text-left font-semibold text-text-secondary">Ürün</th>
                      <th className="px-4 py-2 text-left font-semibold text-text-secondary hidden md:table-cell">Kalite</th>
                      <th className="px-4 py-2 text-left font-semibold text-text-secondary hidden lg:table-cell">Şoför</th>
                      <th className="px-2 sm:px-4 py-2 text-right font-semibold text-text-secondary">Kasa</th>
                      <th className="px-4 py-2 text-right font-semibold text-text-secondary hidden sm:table-cell">Ağırlık</th>
                      <th className="px-4 py-2 text-right font-semibold text-text-secondary hidden md:table-cell">₺/kg</th>
                      <th className="px-2 sm:px-4 py-2 text-right font-semibold text-text-secondary">Tutar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ex.items.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-2 sm:px-4 py-2">
                          <div className="flex flex-col">
                            <span>{item.entry?.product?.name ?? '—'}</span>
                            <span className="lg:hidden text-[10px] text-text-muted">{item.entry?.vehicleSession?.driver?.name ?? '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 hidden md:table-cell">
                          <Badge variant={item.entry?.quality?.name === 'A' ? 'quality-a' : 'quality-b'}>
                            {item.entry?.quality?.name ?? '?'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-text-secondary hidden lg:table-cell">{item.entry?.vehicleSession?.driver?.name ?? '—'}</td>
                        <td className="px-2 sm:px-4 py-2 text-right tabular-nums">{item.entry?.caseCount}</td>
                        <td className="px-4 py-2 text-right tabular-nums hidden sm:table-cell">{formatWeight(item.entry?.weight)}</td>
                        <td className="px-4 py-2 text-right tabular-nums hidden md:table-cell">{item.pricePerKg != null ? `₺${Number(item.pricePerKg).toFixed(2)}` : '—'}</td>
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

function EditExitModal({ exit, onClose, onSave }) {
  const [available, setAvailable] = useState([])
  const [users, setUsers] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [selected, setSelected] = useState(() => new Set(exit.items.map((i) => i.entry.id)))
  const [selectedUser, setSelectedUser] = useState('')
  const [prices, setPrices] = useState(() => {
    const p = {}
    exit.items.forEach((item) => {
      if (item.pricePerKg != null) {
        p[`${item.entry.productId}_${item.entry.qualityId}`] = String(item.pricePerKg)
      }
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

  // Unique product+quality combos for price editing
  const priceRows = []
  const seen = new Set()
  allEntries.forEach((e) => {
    const key = `${e.productId}_${e.qualityId}`
    if (!seen.has(key)) {
      seen.add(key)
      priceRows.push({ key, productId: e.productId, qualityId: e.qualityId, productName: e.product?.name, qualityName: e.quality?.name })
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
            qualityId: r.qualityId,
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
                    <th className="p-3 text-left font-semibold text-text-secondary hidden md:table-cell">Kalite</th>
                    <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">Kasa</th>
                    <th className="p-3 text-right font-semibold text-text-secondary hidden sm:table-cell">Ağırlık</th>
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
                          <span className="sm:hidden text-[10px] text-text-muted">{formatWeight(entry.weight)}</span>
                        </div>
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        <Badge variant={entry.quality?.name === 'A' ? 'quality-a' : 'quality-b'}>
                          {entry.quality?.name ?? '?'}
                        </Badge>
                      </td>
                      <td className="p-2 sm:p-3 text-right tabular-nums">{entry.caseCount}</td>
                      <td className="p-3 text-right tabular-nums hidden sm:table-cell">{formatWeight(entry.weight)}</td>
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
              <label className="text-sm font-medium text-text-secondary block mb-1.5">Fiyat Güncelle (₺/kg)</label>
              <div className="grid grid-cols-2 gap-2">
                {priceRows.map((row) => (
                  <div key={row.key} className="flex items-center gap-2 bg-gray-50 rounded-xl p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate">{row.productName}</p>
                      <Badge variant={row.qualityName === 'A' ? 'quality-a' : 'quality-b'} className="text-xs py-0 px-1.5 mt-0.5">
                        {row.qualityName}
                      </Badge>
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
            <th className="p-4 text-left font-semibold text-text-secondary">Şoför</th>
            <th className="p-4 text-left font-semibold text-text-secondary">Üretici</th>
            <th className="p-4 text-left font-semibold text-text-secondary">Ürün</th>
            <th className="p-4 text-left font-semibold text-text-secondary">Mal Durumu</th>
            <th className="p-4 text-left font-semibold text-text-secondary">Pazar</th>
            <th className="p-4 text-right font-semibold text-text-secondary">Kasa</th>
            <th className="p-4 text-right font-semibold text-text-secondary">Ağırlık</th>
            <th className="p-4 text-left font-semibold text-text-secondary">Giriş</th>
            <th className="p-4 text-left font-semibold text-text-secondary">İrsaliye</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((e) => (
            <tr key={e.id} className={cn('hover:bg-gray-50 transition-colors', e.weak && 'bg-error/5')}>
              <td className="p-4 font-medium text-text-primary">{e.driver?.name ?? '—'}</td>
              <td className="p-4 text-text-secondary">{e.producer?.name ?? '—'}</td>
              <td className="p-4 text-text-primary">{e.product?.name ?? '—'}</td>
              <td className="p-4">
                {e.weak
                  ? <Badge variant="error" className="font-semibold">⚠ Zayıf</Badge>
                  : <Badge variant="success">Normal</Badge>}
              </td>
              <td className="p-4 text-text-secondary">#{e.market?.no} {e.market?.name}</td>
              <td className="p-4 text-right">{e.caseCount}</td>
              <td className="p-4 text-right">{formatWeight(e.weight)}</td>
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
