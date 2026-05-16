import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { formatDate, formatWeight } from '@/utils/formatters'
import { Send, RefreshCw, AlertTriangle, Search } from 'lucide-react'

export function DepoTransferPage() {
  const [entries, setEntries] = useState([])
  const [markets, setMarkets] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  const [transferTarget, setTransferTarget] = useState(null)
  const addToast = useToastStore((s) => s.addToast)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const [d, m] = await Promise.all([api.getDepoEntries(), api.getMarkets()])
      setEntries(d.entries ?? [])
      setMarkets(m ?? [])
    } catch (err) {
      addToast(err.response?.data?.error ?? 'Veriler yüklenemedi', 'error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text-primary">Depo Stoku — Transfer</h1>
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
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="p-3 text-left font-semibold text-text-secondary">Ürün</th>
                  <th className="p-3 text-left font-semibold text-text-secondary">Üretici</th>
                  <th className="p-3 text-left font-semibold text-text-secondary">Şoför</th>
                  <th className="p-3 text-right font-semibold text-text-secondary">Kasa</th>
                  <th className="p-3 text-right font-semibold text-text-secondary">Ağırlık</th>
                  <th className="p-3 text-left font-semibold text-text-secondary">Giriş Tarihi</th>
                  <th className="p-3 text-center font-semibold text-text-secondary">Durum</th>
                  <th className="p-3 text-right font-semibold text-text-secondary">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((e) => (
                  <tr key={e.id} className={e.weak ? 'bg-error/5 hover:bg-error/10' : 'hover:bg-gray-50'}>
                    <td className="p-3 font-medium text-text-primary">{e.product?.name ?? '—'}</td>
                    <td className="p-3 text-text-primary">{e.producer?.name ?? '—'}</td>
                    <td className="p-3 text-text-primary">{e.vehicleSession?.driver?.name ?? '—'}</td>
                    <td className="p-3 text-right tabular-nums font-semibold">{e.caseCount}</td>
                    <td className="p-3 text-right tabular-nums">{formatWeight(e.weight)}</td>
                    <td className="p-3 text-xs text-text-muted whitespace-nowrap">{formatDate(e.createdAt)}</td>
                    <td className="p-3 text-center">
                      {e.weak ? (
                        <Badge variant="error" className="inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Zayıf
                        </Badge>
                      ) : (
                        <Badge variant="success">Normal</Badge>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        onClick={() => setTransferTarget(e)}
                        className="flex items-center gap-1.5 ml-auto"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Transfer
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TransferModal
        entry={transferTarget}
        markets={markets.filter((m) => m.no !== 0 && m.name !== 'DEPO')}
        onClose={() => setTransferTarget(null)}
        onDone={() => { setTransferTarget(null); load() }}
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

function TransferModal({ entry, markets, onClose, onDone }) {
  const [toMarketId, setToMarketId] = useState('')
  const [caseCount, setCaseCount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    if (entry) {
      setToMarketId('')
      setCaseCount(String(entry.caseCount))
      setNote('')
      setError('')
    }
  }, [entry])

  const qty = Number.parseInt(caseCount, 10)
  const isPartial = Number.isFinite(qty) && entry && qty > 0 && qty < entry.caseCount
  const transferWeight = entry && Number.isFinite(qty) && qty > 0
    ? Math.round(entry.weight * (qty / entry.caseCount) * 100) / 100
    : 0
  const remainingCases = entry && Number.isFinite(qty) ? entry.caseCount - qty : 0
  const remainingWeight = entry ? Math.round((entry.weight - transferWeight) * 100) / 100 : 0

  async function handleSave() {
    setError('')
    if (!toMarketId) { setError('Hedef pazar seçilmeli'); return }
    if (!Number.isInteger(qty) || qty <= 0) { setError('Kasa sayısı pozitif tam sayı olmalı'); return }
    if (qty > entry.caseCount) { setError(`En fazla ${entry.caseCount} kasa transfer edilebilir`); return }
    setSaving(true)
    try {
      await api.createTransfer({
        entryId: entry.id,
        toMarketId: Number(toMarketId),
        caseCount: qty,
        note: note.trim() || undefined,
      })
      addToast(isPartial ? `${qty} kasa transfer edildi ✓` : 'Transfer tamamlandı ✓')
      onDone()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Transfer başarısız')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={!!entry} onClose={onClose} title="Transfer">
      {entry && (
        <div className="flex flex-col gap-4">
          <div className="bg-gray-50 rounded-xl p-3 text-sm">
            <p><span className="font-semibold">{entry.product?.name}</span> · {entry.caseCount} kasa · {formatWeight(entry.weight)}</p>
            <p className="text-xs text-text-muted mt-1">
              Üretici: {entry.producer?.name ?? '—'} · Şoför: {entry.vehicleSession?.driver?.name ?? '—'}
            </p>
            {entry.weak && (
              <Badge variant="error" className="mt-2 inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Zayıf Mal
              </Badge>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-secondary">Hedef Pazar</label>
            <select
              value={toMarketId}
              onChange={(e) => setToMarketId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-border bg-white text-text-primary text-base focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Seçin…</option>
              {markets.map((m) => (
                <option key={m.id} value={m.id}>#{m.no} {m.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-secondary">
              Transfer Edilecek Kasa <span className="text-text-muted font-normal">(toplam {entry.caseCount})</span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={entry.caseCount}
              step={1}
              value={caseCount}
              onChange={(e) => setCaseCount(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-border bg-white text-text-primary text-base focus:outline-none focus:ring-2 focus:ring-primary tabular-nums"
            />
            {isPartial && (
              <div className="mt-2 bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs space-y-1">
                <p className="text-text-secondary">
                  <span className="font-semibold text-primary">Transfer:</span> {qty} kasa · {formatWeight(transferWeight)}
                </p>
                <p className="text-text-secondary">
                  <span className="font-semibold">Depoda kalan:</span> {remainingCases} kasa · {formatWeight(remainingWeight)}
                </p>
              </div>
            )}
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
            <Button onClick={handleSave} loading={saving}>Transfer Et</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
