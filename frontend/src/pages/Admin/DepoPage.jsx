import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, errorMessage } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ExportButton } from '@/components/ui/ExportButton'
import { Segmented } from '@/components/ui/Segmented'
import { DepoHistoryTab } from './Depo/DepoHistoryTab'
import { formatDate, formatWeight, formatQty, isCountable, qtyLabel, sumQty, unitLabel } from '@/utils/formatters'
import { TARE_PER_CASE_KG, previewTare } from '@/utils/tare'
import { Boxes, RefreshCw, Plus, AlertTriangle, Package, Search, History } from 'lucide-react'

// İKİ SEKME: stok "şu an depoda ne var", geçmiş "ne girdi / ne çıktı, kim yaptı".
// Ayrı sorular ve stok ekranı ikincisini CEVAPLAYAMAZ: depodan çıkan kayıt
// Entry.marketId değiştiği için stok listesinden tamamen kaybolur, yani gün
// içinde girip aynı gün çıkan mal hiç olmamış gibi görünür.
const TABS = [
  { value: 'stok', label: 'Stok', icon: Boxes },
  { value: 'gecmis', label: 'Geçmiş', icon: History },
]

// Admin/muhasebe depo görünümü. Saha ekranından (/depo) farkı: buradan transfer
// yapılmaz, yalnızca stok görülür ve ELLE giriş açılır. Muhasebe /api/depo'ya
// erişemediği için veri /api/admin/depo altından geliyor.
export function DepoPage() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [tab, setTab] = useState('stok')
  const addToast = useToastStore((s) => s.addToast)

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const d = await api.getAdminDepoEntries()
      setEntries(d.entries ?? [])
    } catch (err) {
      addToast(errorMessage(err, 'Depo yüklenemedi'), 'error')
    } finally {
      setLoading(false)
      if (!silent) setRefreshing(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) =>
      e.product?.name?.toLowerCase().includes(q) ||
      e.producer?.name?.toLowerCase().includes(q) ||
      e.regionSession?.region?.name?.toLowerCase().includes(q))
  }, [entries, query])

  // Ürün + zayıf + siyah kasa + birim bazında grupla — saha ekranıyla aynı anahtar
  const groups = useMemo(() => {
    const map = new Map()
    for (const e of filtered) {
      const unit = e.unit ?? 'CASE'
      const key = `${e.product?.id ?? 0}-${e.weak ? 'W' : 'N'}-${e.disposableCase ? 'D' : 'S'}-${unit}`
      if (!map.has(key)) {
        map.set(key, {
          key,
          productName: e.product?.name ?? '—',
          weak: !!e.weak,
          disposableCase: !!e.disposableCase,
          unit,
          count: 0,
          totalCases: 0,
          totalQty: 0,
        })
      }
      const g = map.get(key)
      g.count += 1
      g.totalCases += e.caseCount ?? 0
      g.totalQty += e.weight ?? 0
    }
    return [...map.values()].sort((a, b) => a.productName.localeCompare(b.productName, 'tr'))
  }, [filtered])

  // Bağ/adet girişlerinde weight sayı tutuyor — kilo toplamına karışmamalı ve
  // bağ ile adet birbirine eklenmemeli.
  const totals = useMemo(() => ({
    cases: entries.reduce((s, e) => s + (e.caseCount ?? 0), 0),
    ...sumQty(entries),
  }), [entries])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <Boxes className="w-6 h-6 text-primary" />
          Depo
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {tab === 'stok' && (
          <ExportButton
            title="Depo Stoku"
            filename={`depo-${new Date().toISOString().slice(0, 10)}`}
            resource="depo"
            prepare={() => ({
              columns: ['Ürün', 'Kasa', 'Miktar', 'Birim', 'Üretici', 'Bölge', 'Zayıf', 'Siyah/Karton Kasa', 'Giriş', 'Kaydeden'],
              rows: filtered.map((e) => [
                e.product?.name ?? '—',
                e.caseCount,
                e.weight,
                unitLabel(e.unit),
                e.producer?.name ?? '',
                e.regionSession?.region?.name ?? '',
                e.weak ? 'Evet' : '',
                e.disposableCase ? 'Evet' : '',
                formatDate(e.createdAt),
                e.createdBy ?? '',
              ]),
            })}
            disabled={!filtered.length}
          />
          )}
          {tab === 'stok' && (
            <Button variant="outline" onClick={() => load()} loading={refreshing} className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Yenile
            </Button>
          )}
          <Button onClick={() => setModalOpen(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Elle Giriş
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <Segmented value={tab} onChange={setTab} options={TABS} className="w-fit" />
      </div>

      {tab === 'gecmis' ? <DepoHistoryTab /> : (<>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <SummaryCard label="Depodaki Giriş" value={entries.length} />
        <SummaryCard label="Toplam Kasa" value={totals.cases} />
        <SummaryCard label="Toplam Ağırlık" value={formatWeight(totals.weight)} />
        <SummaryCard label="Toplam Bağ" value={totals.bunches} />
        <SummaryCard label="Toplam Adet" value={totals.pieces} />
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ürün, üretici veya bölge ara…"
          className="w-full pl-10 pr-4 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="bg-white border border-border rounded-2xl shadow-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" className="text-primary" /></div>
        ) : !groups.length ? (
          <EmptyState
            icon="📦"
            title={entries.length === 0 ? 'Depo boş' : 'Eşleşen kayıt yok'}
            description={entries.length === 0
              ? 'Mal kabulde DEPO seçilen girişler ve elle açılan kayıtlar burada görünür.'
              : 'Aramayı değiştir'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="p-3 text-left font-semibold text-text-secondary">Ürün</th>
                  <th className="p-3 text-center font-semibold text-text-secondary">Durum</th>
                  <th className="p-3 text-right font-semibold text-text-secondary">Kasa</th>
                  <th className="p-3 text-right font-semibold text-text-secondary">Miktar</th>
                  <th className="p-3 text-right font-semibold text-text-secondary">Giriş Sayısı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groups.map((g) => (
                  <tr key={g.key} className={g.weak ? 'bg-error/5' : 'hover:bg-gray-50'}>
                    <td className="p-3 font-medium text-text-primary">{g.productName}</td>
                    <td className="p-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {g.weak
                          ? <Badge variant="error" className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Zayıf</Badge>
                          : <Badge variant="success">Normal</Badge>}
                        {g.disposableCase && (
                          <Badge variant="default" className="inline-flex items-center gap-1">
                            <Package className="w-3 h-3" />Siyah Kasa
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-right tabular-nums">{g.totalCases}</td>
                    <td className="p-3 text-right tabular-nums font-semibold text-primary">
                      {formatQty(g.totalQty, g.unit)}
                    </td>
                    <td className="p-3 text-right tabular-nums text-text-muted">{g.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      </>)}

      <ManualEntryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); load() }}
      />
    </div>
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

// Elle depo girişi. Bölge oturumu gerektirmez — atlanmış mal kabul, açılış stoğu
// veya sayım farkı için. Kasa hareketi YAZILMAZ (bkz. createManualDepoEntry).
function ManualEntryModal({ open, onClose, onSaved }) {
  const [products, setProducts] = useState([])
  const [producers, setProducers] = useState([])
  const [form, setForm] = useState({
    productId: '', caseCount: '', weight: '', producerId: '',
    weak: false, disposableCase: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    if (!open) return
    Promise.all([
      api.getAdminProducts().catch(() => []),
      api.getAdminProducers().catch(() => []),
    ]).then(([p, pr]) => {
      setProducts(p ?? [])
      setProducers((pr ?? []).filter((x) => x.active))
    })
  }, [open])

  const unit = products.find((p) => String(p.id) === String(form.productId))?.unit
  const countable = isCountable(unit)
  // Kasa darası önizlemesi — saha mal kabulüyle aynı kural (utils/tare.js).
  const dara = previewTare({
    unit,
    caseCount: form.caseCount,
    disposableCase: form.disposableCase,
    weight: form.weight,
  })
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setError('') }

  async function handleSave() {
    setError('')
    if (!form.productId) { setError('Ürün seçilmeli'); return }
    const w = Number(form.weight)
    if (countable) {
      if (!Number.isInteger(w) || w < 1) {
        setError(`${qtyLabel(unit)} pozitif tam sayı olmalı`); return
      }
    } else {
      const c = Number(form.caseCount)
      if (!Number.isInteger(c) || c < 1) { setError('Kasa adedi pozitif tam sayı olmalı'); return }
      if (!Number.isFinite(w) || w <= 0) { setError('Kilo pozitif olmalı'); return }
    }
    // Sunucu da aynı kuralı uyguluyor (utils/tare.js); burada durdurmak
    // muhasebeciye hatayı kayıt denemesinden önce gösteriyor.
    if (dara.gecersiz) {
      setError(`${dara.tare} kg dara, girilen ${dara.gross} kg'a eşit veya fazla`); return
    }
    setSaving(true)
    try {
      const saved = await api.createManualDepoEntry({
        productId: Number(form.productId),
        // Kasa her birimde gider; bağ/adette boş bırakılmışsa kasasız giriş
        caseCount: Number(form.caseCount) || 0,
        weight: w,
        producerId: form.producerId ? Number(form.producerId) : undefined,
        weak: form.weak,
        disposableCase: form.disposableCase,
      })
      addToast(`${saved.product?.name} depoya eklendi ✓`)
      setForm({ productId: '', caseCount: '', weight: '', producerId: '', weak: false, disposableCase: false })
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'Kayıt başarısız'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Depoya Elle Giriş">
      <div className="flex flex-col gap-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
          Bu kayıt bölge oturumuna bağlanmaz ve <strong>kasa hareketi oluşturmaz</strong> —
          hangi bölgenin kasasından düşeceği belli olmadığı için. Kasa düzeltmesi
          gerekiyorsa Kasa Takip ekranından ayrıca gir.
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-text-secondary">Ürün</label>
          <select
            value={form.productId}
            onChange={(e) => set({ productId: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-border bg-white text-base focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Seçin…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon ? `${p.icon} ` : ''}{p.name}{isCountable(p.unit) ? ` (${unitLabel(p.unit)})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-secondary">
              {countable ? 'Kasa (opsiyonel)' : 'Kasa'}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={form.caseCount}
              onChange={(e) => set({ caseCount: e.target.value.replace(/\D/g, '') })}
              placeholder="0"
              className="w-full px-4 py-3 rounded-xl border border-border bg-white text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-secondary">{qtyLabel(unit)}</label>
            <input
              type="text"
              inputMode={countable ? 'numeric' : 'decimal'}
              value={form.weight}
              onChange={(e) => {
                if (countable) return set({ weight: e.target.value.replace(/\D/g, '') })
                let v = e.target.value.replace(/,/g, '.').replace(/[^0-9.]/g, '')
                const i = v.indexOf('.')
                if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '')
                set({ weight: v })
              }}
              placeholder="0"
              className="w-full px-4 py-3 rounded-xl border border-border bg-white text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {/* Girilen kilo BRÜT, kayda net yazılır — bkz. utils/tare.js */}
            {dara.uygulandi && (
              dara.gecersiz
                ? <p className="text-xs font-semibold text-error mt-1">{dara.tare} kg dara, girilen kilodan fazla</p>
                : <p className="text-xs text-text-secondary mt-1 tabular-nums">
                    {dara.gross} − ({Number(form.caseCount)} × {TARE_PER_CASE_KG} kg dara) ={' '}
                    <strong className="text-primary">{dara.net} kg net</strong>
                  </p>
            )}
          </div>
        </div>

        {/* Kalite seçimi kaldırıldı (2026-08-13): özellik kullanılmıyor ve saha
            mal kabulü de kalite göndermiyordu — form alanı sahte bir ayrım
            üretiyordu. Fiyat artık ürün başına tek. */}
        <div className="grid grid-cols-1 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-secondary">Üretici (opsiyonel)</label>
            <select
              value={form.producerId}
              onChange={(e) => set({ producerId: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-border bg-white text-base focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">—</option>
              {producers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.weak}
              onChange={(e) => set({ weak: e.target.checked })}
              className="w-4 h-4 rounded accent-error" />
            <span className="text-sm text-text-secondary">Zayıf mal</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.disposableCase}
              onChange={(e) => set({ disposableCase: e.target.checked })}
              className="w-4 h-4 rounded accent-gray-700" />
            <span className="text-sm text-text-secondary">
              Siyah/karton kasa <span className="text-text-muted">— kasa hesabına girmez</span>
            </span>
          </label>
        </div>

        {error && (
          <div className="bg-error/10 border border-error/40 rounded-xl p-3 flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
            <p className="text-sm text-error font-medium">{error}</p>
          </div>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
          <Button onClick={handleSave} loading={saving}>Depoya Ekle</Button>
        </div>
      </div>
    </Modal>
  )
}
