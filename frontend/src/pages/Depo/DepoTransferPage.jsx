import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { formatDate, formatWeight } from '@/utils/formatters'
import { Send, RefreshCw, AlertTriangle, Search, ChevronRight, ChevronDown, Undo2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'

const REFRESH_INTERVAL_MS = 10_000

export function DepoTransferPage() {
  const [entries, setEntries] = useState([])
  const [markets, setMarkets] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  const [transferTarget, setTransferTarget] = useState(null) // group object
  const [returnModalOpen, setReturnModalOpen] = useState(false)
  const [expandedProducts, setExpandedProducts] = useState(() => new Set())
  const [products, setProducts] = useState([])
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => { api.getProducts().then(setProducts).catch(() => {}) }, [])

  function toggleExpand(productId) {
    setExpandedProducts((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const [d, m] = await Promise.all([api.getDepoEntries(), api.getMarkets()])
      setEntries(d.entries ?? [])
      setMarkets(m ?? [])
    } catch (err) {
      if (!silent) addToast(err.response?.data?.error ?? 'Veriler yüklenemedi', 'error')
    } finally {
      if (!silent) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [addToast])

  // İlk yükleme + 10sn'de bir sessiz yenileme. Transfer modalı açıkken durdur.
  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (transferTarget || returnModalOpen) return // modal açıkken auto-refresh durur
    const id = setInterval(() => {
      // Sekme arka plandaysa istek atma (sessiz pause)
      if (document.hidden) return
      load(true)
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [load, transferTarget, returnModalOpen])

  const filtered = useMemo(() => {
    if (!query.trim()) return entries
    const q = query.trim().toLowerCase()
    return entries.filter((e) =>
      e.product?.name?.toLowerCase().includes(q) ||
      e.producer?.name?.toLowerCase().includes(q) ||
      e.vehicleSession?.driver?.name?.toLowerCase().includes(q)
    )
  }, [entries, query])

  const totalCases = useMemo(() => entries.reduce((s, e) => s + (e.caseCount ?? 0), 0), [entries])
  const totalWeight = useMemo(() => entries.reduce((s, e) => s + (e.weight ?? 0), 0), [entries])

  // Ürün + (Normal/Zayıf) bazında grupla — zayıf ayrı satır
  const groups = useMemo(() => {
    const map = new Map()
    for (const e of filtered) {
      const productId = e.product?.id ?? 0
      const isWeak = !!e.weak
      const key = `${productId}-${isWeak ? 'W' : 'N'}`
      if (!map.has(key)) {
        map.set(key, {
          key,
          productId,
          productName: e.product?.name ?? '—',
          weak: isWeak,
          entries: [],
          totalCases: 0,
          totalWeight: 0,
          firstDate: e.createdAt,
        })
      }
      const g = map.get(key)
      g.entries.push(e)
      g.totalCases += e.caseCount ?? 0
      g.totalWeight += e.weight ?? 0
      if (new Date(e.createdAt) < new Date(g.firstDate)) g.firstDate = e.createdAt
    }
    return [...map.values()].sort((a, b) => {
      // Önce ürün adı, sonra normal -> zayıf
      const byName = a.productName.localeCompare(b.productName, 'tr')
      if (byName !== 0) return byName
      return a.weak === b.weak ? 0 : a.weak ? 1 : -1
    })
  }, [filtered])

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text-primary">Depo Stoku — Transfer</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setReturnModalOpen(true)}
            className="flex items-center gap-2"
          >
            <Undo2 className="w-4 h-4" />
            İade Kabul
          </Button>
          <Button
            variant="outline"
            onClick={load}
            loading={refreshing}
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Yenile
          </Button>
        </div>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <SummaryCard label="Depodaki Giriş" value={entries.length} />
        <SummaryCard label="Toplam Kasa" value={totalCases} />
        <SummaryCard label="Toplam Ağırlık" value={formatWeight(totalWeight)} />
      </div>

      {/* Arama */}
      <div className="relative mb-4 max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ürün, üretici veya şoför ara…"
          className="w-full pl-10 pr-4 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Liste */}
      <div className="bg-white border border-border rounded-2xl shadow-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" className="text-primary" /></div>
        ) : !filtered.length ? (
          <EmptyState
            icon="📦"
            title={entries.length === 0 ? 'Depoda ürün yok' : 'Eşleşen kayıt yok'}
            description={entries.length === 0 ? 'Mal kabul tarafında DEPO seçilerek girişler yapıldığında burada görünür.' : 'Aramayı değiştir'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary w-6 sm:w-8"></th>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Ürün</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">
                    <span className="sm:hidden">Kasa</span>
                    <span className="hidden sm:inline">Toplam Kasa</span>
                  </th>
                  <th className="p-3 text-right font-semibold text-text-secondary hidden sm:table-cell">Toplam Ağırlık</th>
                  <th className="p-3 text-right font-semibold text-text-secondary hidden lg:table-cell">Giriş Sayısı</th>
                  <th className="p-3 text-left font-semibold text-text-secondary hidden lg:table-cell">İlk Giriş</th>
                  <th className="p-3 text-center font-semibold text-text-secondary hidden md:table-cell">Durum</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groups.map((g) => {
                  const expanded = expandedProducts.has(g.key)
                  return (
                    <Fragment key={g.key}>
                      <tr
                        onClick={() => toggleExpand(g.key)}
                        className={`cursor-pointer ${g.weak ? 'bg-error/5 hover:bg-error/10' : 'hover:bg-gray-50'}`}
                      >
                        <td className="p-2 sm:p-3 text-text-muted">
                          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="p-2 sm:p-3 font-semibold text-text-primary">
                          <div className="flex flex-col">
                            <span>{g.productName}</span>
                            {g.weak && <span className="text-[10px] sm:text-xs font-normal text-error">Zayıf</span>}
                          </div>
                        </td>
                        <td className="p-2 sm:p-3 text-right tabular-nums font-bold text-primary">{g.totalCases}</td>
                        <td className="p-3 text-right tabular-nums hidden sm:table-cell">{formatWeight(g.totalWeight)}</td>
                        <td className="p-3 text-right text-text-muted tabular-nums hidden lg:table-cell">{g.entries.length}</td>
                        <td className="p-3 text-xs text-text-muted whitespace-nowrap hidden lg:table-cell">{formatDate(g.firstDate)}</td>
                        <td className="p-3 text-center hidden md:table-cell">
                          {g.weak ? (
                            <Badge variant="error" className="inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Zayıf
                            </Badge>
                          ) : (
                            <Badge variant="success">Normal</Badge>
                          )}
                        </td>
                        <td className="p-2 sm:p-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            onClick={() => setTransferTarget(g)}
                            className="inline-flex items-center gap-1 sm:gap-1.5 ml-auto"
                            title="Transfer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Transfer</span>
                          </Button>
                        </td>
                      </tr>
                      {expanded && g.entries.map((e) => (
                        <tr key={`e-${e.id}`} className="bg-gray-50/50 text-[11px] sm:text-xs">
                          <td></td>
                          <td className="p-2 pl-6 sm:pl-8 text-text-secondary" colSpan={2}>
                            <span className="text-text-muted">↳ </span>
                            {e.producer?.name ?? '—'} · {e.vehicleSession?.driver?.name ?? '—'}
                            <div className="sm:hidden text-text-muted mt-0.5">
                              {e.caseCount} kasa · {formatWeight(e.weight)} · {formatDate(e.createdAt)}
                              {e.weak && <span className="ml-2 text-error">⚠ Zayıf</span>}
                            </div>
                          </td>
                          <td className="p-2 text-right tabular-nums hidden sm:table-cell">{formatWeight(e.weight)}</td>
                          <td className="p-2 text-right tabular-nums hidden lg:table-cell">{e.caseCount} k.</td>
                          <td className="p-2 text-text-muted whitespace-nowrap hidden lg:table-cell">{formatDate(e.createdAt)}</td>
                          <td className="p-2 text-center hidden md:table-cell">
                            {e.weak && (
                              <Badge variant="error" className="inline-flex items-center gap-1 text-[10px]">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Zayıf
                              </Badge>
                            )}
                          </td>
                          <td></td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TransferModal
        group={transferTarget}
        markets={markets.filter((m) => m.no !== 0 && m.name !== 'DEPO')}
        onClose={() => setTransferTarget(null)}
        onDone={() => { setTransferTarget(null); load() }}
      />

      <ReturnModal
        open={returnModalOpen}
        markets={markets.filter((m) => m.no !== 0 && m.name !== 'DEPO')}
        products={products}
        onClose={() => setReturnModalOpen(false)}
        onDone={() => { setReturnModalOpen(false); load() }}
      />
    </div>
  )
}

function ReturnModal({ open, markets, products, onClose, onDone }) {
  const [fromMarketId, setFromMarketId] = useState('')
  const [productId, setProductId] = useState('')
  const [caseCount, setCaseCount] = useState('')
  const [weight, setWeight] = useState('')
  const [weak, setWeak] = useState(true) // iade genelde zayıf
  const [discarded, setDiscarded] = useState(false) // atılan: depoya alma, sadece kasa+borç
  const [pricePerKg, setPricePerKg] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    if (open) {
      setFromMarketId(''); setProductId(''); setCaseCount(''); setWeight('')
      setWeak(true); setDiscarded(false); setPricePerKg(''); setNote(''); setError('')
    }
  }, [open])

  async function handleSave() {
    setError('')
    if (!fromMarketId) { setError('İade veren bayi seçilmeli'); return }
    if (!productId) { setError('Ürün seçilmeli'); return }
    const c = Number(caseCount)
    const w = Number(weight)
    if (!Number.isInteger(c) || c < 1) { setError('Kasa adedi pozitif tam sayı olmalı'); return }
    if (!Number.isFinite(w) || w <= 0) { setError('Ağırlık pozitif olmalı'); return }
    setSaving(true)
    try {
      const result = await api.createDepoReturn({
        fromMarketId: Number(fromMarketId),
        productId: Number(productId),
        caseCount: c,
        weight: w,
        weak,
        discarded,
        pricePerKg: pricePerKg ? Number(pricePerKg) : undefined,
        note: note.trim() || undefined,
      })
      const tip = discarded ? ' (mal döküldü, depoya alınmadı)' : ''
      addToast(`İade kabul edildi${tip} · Bayi borcundan ₺${result.amount.toFixed(2)} düşüldü ✓`)
      onDone()
    } catch (err) {
      setError(err.response?.data?.error ?? 'İade kaydı başarısız')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="İade Kabul">
      <div className="flex flex-col gap-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
          Bayiden gelen iade mal sisteme alınır: yeni depo girişi oluşur, bayi borcundan değer düşülür ve bayi kasa bakiyesinden sayı eksilir.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-secondary">İade Veren Bayi</label>
            <select
              value={fromMarketId}
              onChange={(e) => setFromMarketId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Seçin…</option>
              {markets.map((m) => (
                <option key={m.id} value={m.id}>#{m.no} {m.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-secondary">Ürün</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Seçin…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Input
            label="Kasa"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={caseCount}
            onChange={(e) => setCaseCount(e.target.value.replace(/\D/g, ''))}
            placeholder="0"
          />
          <Input
            label="Kilo (kg)"
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="0"
          />
          <Input
            label="Birim Fiyat (TL/kg)"
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            value={pricePerKg}
            onChange={(e) => setPricePerKg(e.target.value)}
            placeholder="Boş = bugünkü fiyat"
            title="Boş bırakırsanız sistem bugünkü fiyat tablosundan otomatik alır"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-6">
          <label className={`flex items-center gap-2 cursor-pointer ${discarded ? 'opacity-50' : ''}`}>
            <input
              type="checkbox"
              checked={weak}
              disabled={discarded}
              onChange={(e) => setWeak(e.target.checked)}
              className="w-4 h-4 rounded accent-error"
            />
            <span className="text-sm text-text-secondary">Zayıf mal olarak işaretle</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={discarded}
              onChange={(e) => setDiscarded(e.target.checked)}
              className="w-4 h-4 rounded accent-error"
            />
            <span className="text-sm text-text-secondary" title="Mal döküldü/atıldı — depoya alınmaz, sadece kasa ve bayi borcu işlenir">
              Atılan (depoya alma, kasa + borç düş)
            </span>
          </label>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-text-secondary">Not (opsiyonel)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Açıklama…"
            className="w-full px-4 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
          <Button onClick={handleSave} loading={saving}>İadeyi Kaydet</Button>
        </div>
      </div>
    </Modal>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div className="bg-white border border-border rounded-2xl p-4 shadow-card">
      <p className="text-xs text-text-muted uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-text-primary mt-1">{value}</p>
    </div>
  )
}

function makeSlot() { return { toMarketId: '', caseCount: '' } }

function TransferModal({ group, markets, onClose, onDone }) {
  const [slots, setSlots] = useState([makeSlot()])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    if (group) {
      setSlots([makeSlot()])
      setNote('')
      setError('')
    }
  }, [group])

  function updateSlot(idx, field, value) {
    // Kasa input'una sadece pozitif tam sayı kabul et
    let v = value
    if (field === 'caseCount' && typeof value === 'string') {
      v = value.replace(/[^0-9]/g, '')
    }
    setSlots((prev) => {
      const next = prev.map((s, i) => (i === idx ? { ...s, [field]: v } : s))
      // Son slot tam doluysa yeni boş slot ekle (mal kabul gibi)
      const last = next[next.length - 1]
      if (last.toMarketId && last.caseCount && Number(last.caseCount) > 0) {
        return [...next, makeSlot()]
      }
      return next
    })
    setError('')
  }

  function removeSlot(idx) {
    setSlots((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx))
  }

  // Dolu slotlar (geçerli olanlar)
  const validSlots = slots.filter((s) => s.toMarketId && Number(s.caseCount) > 0)
  const totalRequested = validSlots.reduce((sum, s) => sum + Number(s.caseCount), 0)
  const remaining = group ? group.totalCases - totalRequested : 0

  async function handleSave() {
    setError('')
    if (!validSlots.length) { setError('En az bir hedef pazar + kasa adedi gir'); return }
    if (totalRequested > group.totalCases) {
      setError(`Toplam ${totalRequested} kasa istendi, depoda sadece ${group.totalCases} kasa var`)
      return
    }
    // Aynı pazara birden fazla satır olmamalı
    const marketIds = validSlots.map((s) => s.toMarketId)
    if (new Set(marketIds).size !== marketIds.length) {
      setError('Aynı pazara birden fazla satır var, birleştir')
      return
    }
    setSaving(true)
    try {
      // Sıralı API çağrıları — her bir transfer kendi transaction'ında
      let totalAffected = 0
      for (const slot of validSlots) {
        const result = await api.createGroupedTransfer({
          productId: group.productId,
          requestedCases: Number(slot.caseCount),
          toMarketId: Number(slot.toMarketId),
          note: note.trim() || undefined,
          weak: group.weak,
        })
        totalAffected += result?.entriesAffected ?? 1
      }
      const tip = group.weak ? ' (zayıf)' : ''
      addToast(`${totalRequested} kasa${tip} ${validSlots.length} pazara dağıtıldı (${totalAffected} giriş etkilendi) ✓`)
      onDone()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Transfer başarısız (kısmi tamamlanmış olabilir, sayfayı yenile)')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={!!group} onClose={onClose} title="Transfer">
      {group && (
        <div className="flex flex-col gap-4">
          <div className="bg-gray-50 rounded-xl p-3 text-sm">
            <p>
              <span className="font-semibold">{group.productName}</span>
              {group.weak && <span className="ml-2 text-xs text-error font-medium">(Zayıf)</span>}
              {' · '}{group.totalCases} kasa · {formatWeight(group.totalWeight)}
            </p>
            <p className="text-xs text-text-muted mt-1">
              {group.entries.length} farklı giriş (en eski: {formatDate(group.firstDate)})
            </p>
            {group.weak && (
              <Badge variant="error" className="mt-2 inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Sadece zayıf mallar transfer edilecek
              </Badge>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {slots.map((slot, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <div className="flex-1">
                  <label className="text-xs font-medium text-text-secondary mb-1 block">Hedef Pazar</label>
                  <select
                    value={slot.toMarketId}
                    onChange={(e) => updateSlot(idx, 'toMarketId', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-white text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Seçin…</option>
                    {markets.map((m) => (
                      <option key={m.id} value={m.id}>#{m.no} {m.name}</option>
                    ))}
                  </select>
                </div>
                <div className="w-32">
                  <label className="text-xs font-medium text-text-secondary mb-1 block">Kasa</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={slot.caseCount}
                    onChange={(e) => updateSlot(idx, 'caseCount', e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-white text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary tabular-nums"
                  />
                </div>
                {slots.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSlot(idx)}
                    className="self-end p-2 text-text-muted hover:text-error rounded-lg"
                    title="Sil"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs space-y-1">
            <p className="text-text-secondary flex justify-between">
              <span>Toplam transfer:</span>
              <span className="font-bold text-primary tabular-nums">{totalRequested} kasa</span>
            </p>
            <p className="text-text-secondary flex justify-between">
              <span>Depoda kalacak:</span>
              <span className={`font-bold tabular-nums ${remaining < 0 ? 'text-error' : 'text-text-primary'}`}>{remaining} kasa</span>
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-secondary">Not (opsiyonel)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Açıklama…"
              className="w-full px-4 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={!validSlots.length || totalRequested > group.totalCases}
            >
              Transfer Et
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
