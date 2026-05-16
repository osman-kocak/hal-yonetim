import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { formatDate, today } from '@/utils/formatters'
import { cn } from '@/utils/cn'
import { Plus, Trash2, Store, User, Boxes, FileText } from 'lucide-react'

const TABS = [
  { key: 'market', label: 'Bayi Kasaları', icon: Store },
  { key: 'driver', label: 'Şoför Kasaları', icon: User },
]

// Hareket tipi → görsel meta
const TYPE_META = {
  MARKET_OUT:    { label: 'Bayiye Çıkış',      variant: 'warning', sign: '+' },
  MARKET_IN:     { label: 'Bayiden İade',      variant: 'success', sign: '−' },
  MARKET_INIT:   { label: 'Başlangıç Bakiye',  variant: 'default', sign: '+' },
  MARKET_ADJUST: { label: 'Düzeltme',          variant: 'primary', sign: '±' },
  DRIVER_OUT:    { label: 'Şoföre Avans',      variant: 'warning', sign: '+' },
  DRIVER_IN:     { label: 'Şoförden İade',     variant: 'success', sign: '−' },
  DRIVER_INIT:   { label: 'Başlangıç Bakiye',  variant: 'default', sign: '+' },
  DRIVER_ADJUST: { label: 'Düzeltme',          variant: 'primary', sign: '±' },
}

const MARKET_MANUAL_TYPES = ['MARKET_IN', 'MARKET_INIT', 'MARKET_ADJUST']
const DRIVER_MANUAL_TYPES = ['DRIVER_OUT', 'DRIVER_IN', 'DRIVER_INIT', 'DRIVER_ADJUST']

function balanceClasses(balance) {
  if (balance > 0) return 'bg-amber-50 border-amber-200 text-amber-900'
  if (balance < 0) return 'bg-red-50 border-red-200 text-red-900'
  return 'bg-green-50 border-green-200 text-green-900'
}

export function CaseTrackingPage() {
  const [tabIdx, setTabIdx] = useState(0)
  const tab = TABS[tabIdx].key

  const [balances, setBalances] = useState([])
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(false)

  // Filtreler
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterId, setFilterId] = useState('')

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const addToast = useToastStore((s) => s.addToast)

  const fetchBalances = useCallback(() => {
    const fn = tab === 'market' ? api.getMarketCaseBalances : api.getDriverCaseBalances
    fn().then(setBalances).catch(() => addToast('Bakiyeler yüklenemedi', 'error'))
  }, [tab])

  const fetchMovements = useCallback(() => {
    setLoading(true)
    const params = { scope: tab }
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    if (filterId) {
      if (tab === 'market') params.marketId = filterId
      else params.driverId = filterId
    }
    api.getCaseMovements(params)
      .then(setMovements)
      .catch(() => addToast('Hareketler yüklenemedi', 'error'))
      .finally(() => setLoading(false))
  }, [tab, dateFrom, dateTo, filterId])

  useEffect(() => { fetchBalances() }, [fetchBalances])
  useEffect(() => { fetchMovements() }, [fetchMovements])

  function refreshAll() {
    fetchBalances()
    fetchMovements()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteCaseMovement(deleteTarget.id)
      addToast('Hareket silindi ✓')
      setDeleteTarget(null)
      refreshAll()
    } catch (err) {
      addToast(err.response?.data?.error ?? 'Silinemedi', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const totalBalance = useMemo(() => balances.reduce((s, b) => s + (b.balance ?? 0), 0), [balances])
  const outsideCount = useMemo(() => balances.filter((b) => (b.balance ?? 0) !== 0).length, [balances])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <Boxes className="w-6 h-6 text-primary" />
          Kasa Takip
        </h1>
        <Button onClick={() => setModalOpen(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> Yeni Hareket
        </Button>
      </div>

      {/* Tab */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
        {TABS.map((t, i) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => { setTabIdx(i); setFilterId('') }}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tabIdx === i ? 'bg-white text-text-primary shadow-card' : 'text-text-muted hover:text-text-primary'
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Özet kart */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-border rounded-2xl p-4 shadow-card">
          <p className="text-xs text-text-muted uppercase tracking-wide">Dışarıdaki Toplam Kasa</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{totalBalance}</p>
        </div>
        <div className="bg-white border border-border rounded-2xl p-4 shadow-card">
          <p className="text-xs text-text-muted uppercase tracking-wide">
            {tab === 'market' ? 'Kasa Olan Bayi' : 'Kasa Olan Şoför'}
          </p>
          <p className="text-2xl font-bold text-text-primary mt-1">
            {outsideCount} / {balances.length}
          </p>
        </div>
        <div className="bg-white border border-border rounded-2xl p-4 shadow-card">
          <p className="text-xs text-text-muted uppercase tracking-wide">Hareket Sayısı</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{movements.length}</p>
        </div>
      </div>

      {/* Bakiye kartları */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-text-secondary mb-3 uppercase tracking-wide">
          {tab === 'market' ? 'Bayi Bakiyeleri' : 'Şoför Bakiyeleri'}
        </h2>
        {balances.length === 0 ? (
          <p className="text-sm text-text-muted">Kayıt yok</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {balances.map((b) => (
              <button
                key={b.id}
                onClick={() => setFilterId(String(b.id))}
                className={cn(
                  'border rounded-2xl p-3 text-left transition-all hover:shadow-card',
                  balanceClasses(b.balance ?? 0),
                  String(filterId) === String(b.id) && 'ring-2 ring-primary ring-offset-1'
                )}
              >
                <p className="text-xs font-medium truncate">
                  {tab === 'market' ? `#${b.no} ${b.name}` : b.name}
                </p>
                <p className="text-xl font-bold mt-1">{b.balance ?? 0}</p>
                <p className="text-[10px] opacity-70 mt-0.5">kasa</p>
              </button>
            ))}
          </div>
        )}
        {filterId && (
          <button
            onClick={() => setFilterId('')}
            className="text-xs text-primary hover:underline mt-2"
          >
            Filtreyi temizle
          </button>
        )}
      </div>

      {/* Filtre */}
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
            Tarihi temizle
          </button>
        )}
      </div>

      {/* Hareket tablosu */}
      <div className="bg-white border border-border rounded-2xl shadow-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" className="text-primary" /></div>
        ) : movements.length === 0 ? (
          <EmptyState icon="📦" title="Hareket yok" description="Filtreyi değiştir veya yeni hareket ekle" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="p-3 text-left font-semibold text-text-secondary">Tarih</th>
                  <th className="p-3 text-left font-semibold text-text-secondary">Tip</th>
                  <th className="p-3 text-left font-semibold text-text-secondary">{tab === 'market' ? 'Bayi' : 'Şoför'}</th>
                  <th className="p-3 text-right font-semibold text-text-secondary">Adet</th>
                  <th className="p-3 text-left font-semibold text-text-secondary">Not</th>
                  <th className="p-3 text-left font-semibold text-text-secondary">Giren</th>
                  <th className="p-3 text-right font-semibold text-text-secondary">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movements.map((m) => {
                  const meta = TYPE_META[m.type] ?? { label: m.type, variant: 'default', sign: '' }
                  const isExit = !!m.exitId
                  return (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-3 text-text-primary whitespace-nowrap">{formatDate(m.occurredAt)}</td>
                      <td className="p-3">
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                        {isExit && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-text-muted">
                            <FileText className="w-3 h-3" />
                            İrsaliye #{m.exitId}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-text-primary">
                        {tab === 'market'
                          ? (m.market ? `#${m.market.no} ${m.market.name}` : '—')
                          : (m.driver?.name ?? '—')}
                      </td>
                      <td className="p-3 text-right font-semibold tabular-nums">
                        <span className={cn(
                          m.qty < 0 ? 'text-error' : 'text-text-primary'
                        )}>
                          {meta.sign === '±' ? (m.qty > 0 ? `+${m.qty}` : m.qty) : `${meta.sign}${Math.abs(m.qty)}`}
                        </span>
                      </td>
                      <td className="p-3 text-text-muted text-xs max-w-xs truncate">{m.note ?? '—'}</td>
                      <td className="p-3 text-text-muted text-xs">{m.createdBy ?? '—'}</td>
                      <td className="p-3 text-right">
                        {!isExit && (
                          <button
                            onClick={() => setDeleteTarget(m)}
                            className="p-2 rounded-lg hover:bg-red-50 text-error transition-colors"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MovementModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        scope={tab}
        onSaved={() => { setModalOpen(false); refreshAll() }}
        markets={tab === 'market' ? balances : []}
        drivers={tab === 'driver' ? balances : []}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Hareketi Sil"
        description={
          deleteTarget
            ? `Bu işlem geri alınamaz. Bakiye yeniden hesaplanacak. (${TYPE_META[deleteTarget.type]?.label ?? deleteTarget.type}, ${deleteTarget.qty} kasa)`
            : ''
        }
      />
    </div>
  )
}

function MovementModal({ open, onClose, scope, onSaved, markets, drivers }) {
  const addToast = useToastStore((s) => s.addToast)
  const isMarket = scope === 'market'
  const availableTypes = isMarket ? MARKET_MANUAL_TYPES : DRIVER_MANUAL_TYPES

  const [type, setType] = useState(availableTypes[0])
  const [targetId, setTargetId] = useState('')
  const [qty, setQty] = useState('')
  const [adjustSign, setAdjustSign] = useState('+')
  const [note, setNote] = useState('')
  const [occurredAt, setOccurredAt] = useState(today())
  const [createdBy, setCreatedBy] = useState('Admin')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setType(availableTypes[0])
    setTargetId('')
    setQty('')
    setAdjustSign('+')
    setNote('')
    setOccurredAt(today())
    setError('')
  }, [open, scope])

  async function handleSave() {
    setError('')
    if (!targetId) { setError(isMarket ? 'Pazar seçilmeli' : 'Şoför seçilmeli'); return }
    const q = parseInt(qty, 10)
    if (!Number.isInteger(q) || q <= 0) { setError('Adet pozitif tam sayı olmalı'); return }
    const signedQty = adjustSign === '−' ? -q : q

    setSaving(true)
    try {
      await api.createCaseMovement({
        type,
        qty: signedQty,
        marketId: isMarket ? Number(targetId) : undefined,
        driverId: isMarket ? undefined : Number(targetId),
        note: note.trim() || undefined,
        occurredAt: occurredAt || undefined,
        createdBy: createdBy.trim() || undefined,
      })
      addToast('Hareket kaydedildi ✓')
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isMarket ? 'Bayi Kasa Hareketi' : 'Şoför Kasa Hareketi'}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-text-secondary">Hareket Tipi</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-border bg-white text-text-primary text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          >
            {availableTypes.map((t) => (
              <option key={t} value={t}>{TYPE_META[t]?.label ?? t}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-text-secondary">
            {isMarket ? 'Pazar' : 'Şoför'}
          </label>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-border bg-white text-text-primary text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          >
            <option value="">Seçin…</option>
            {(isMarket ? markets : drivers).map((x) => (
              <option key={x.id} value={x.id}>
                {isMarket ? `#${x.no} ${x.name}` : x.name}
                {' '}(bakiye: {x.balance ?? 0})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Adet"
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-secondary">Yön</label>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {['+', '−'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setAdjustSign(s)}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-base font-semibold transition-all',
                    adjustSign === s
                      ? (s === '+' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')
                      : 'text-text-muted hover:text-text-primary'
                  )}
                >
                  {s} {s === '+' ? 'Ekle' : 'Çıkar'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Input
          label="Tarih"
          type="date"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
        />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-text-secondary">Not (opsiyonel)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full px-4 py-2 rounded-xl border border-border bg-white text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder="Açıklama…"
          />
        </div>

        <Input
          label="Kim Girdi"
          type="text"
          value={createdBy}
          onChange={(e) => setCreatedBy(e.target.value)}
          placeholder="Adınız"
        />

        {error && <p className="text-sm text-error">{error}</p>}

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
          <Button onClick={handleSave} loading={saving}>Kaydet</Button>
        </div>
      </div>
    </Modal>
  )
}
