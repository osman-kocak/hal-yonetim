import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/services/api'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, MarketAutocomplete } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatWeight } from '@/utils/formatters'
import { Pencil, AlertTriangle, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

export function RecentEntriesList({ sessionId }) {
  const [entries, setEntries] = useState([])
  const [markets, setMarkets] = useState([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const addToast = useToastStore((s) => s.addToast)
  const { driverBalance, setDriverBalance } = useAppStore()

  const load = useCallback(async () => {
    try {
      const data = await api.getSessionEntries(sessionId)
      setEntries(data ?? [])
    } catch {
      // sessizce geç
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    load()
    api.getMarkets().then(setMarkets).catch(() => {})
  }, [sessionId, load])

  // 10sn auto-refresh
  useEffect(() => {
    if (!sessionId || editTarget) return
    const id = setInterval(load, 10_000)
    return () => clearInterval(id)
  }, [sessionId, editTarget, load])

  const totalCases = useMemo(() => entries.reduce((s, e) => s + (e.caseCount ?? 0), 0), [entries])
  const totalWeight = useMemo(() => entries.reduce((s, e) => s + (e.weight ?? 0), 0), [entries])

  function handleEdited(updated, deltaCases) {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)))
    // Şoför bakiyesini optimistik güncelle (DRIVER_IN sign=-1, qty pozitif. delta negatif = bakiye yukarı)
    if (driverBalance != null && deltaCases !== 0) {
      setDriverBalance(driverBalance - deltaCases)
    }
    setEditTarget(null)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteEntry(deleteTarget.id)
      const restored = deleteTarget.caseCount ?? 0
      setEntries((prev) => prev.filter((e) => e.id !== deleteTarget.id))
      // Bakiye geri: DRIVER_IN qty kadar bakiyeden düşmüştü, geri ekle
      if (driverBalance != null && deleteTarget.vehicleSessionId) {
        setDriverBalance(driverBalance + restored)
      }
      addToast('Giriş silindi ✓')
      setDeleteTarget(null)
    } catch (err) {
      addToast(err.response?.data?.error ?? 'Silme başarısız', 'error')
    } finally {
      setDeleting(false)
    }
  }

  if (loading && !entries.length) return null
  if (!entries.length) return null

  return (
    <div className="mt-8 bg-white border border-border rounded-2xl shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
      >
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="text-base font-bold text-text-primary">Son Girişler</h2>
          <span className="text-xs text-text-muted">
            {entries.length} kayıt · {totalCases} kasa · {formatWeight(totalWeight)}
          </span>
        </div>
        {collapsed ? <ChevronDown className="w-5 h-5 text-text-muted" /> : <ChevronUp className="w-5 h-5 text-text-muted" />}
      </button>

      {!collapsed && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-gray-50 border-b border-border">
              <tr>
                <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Ürün</th>
                <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary hidden md:table-cell">Pazar</th>
                <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">Kasa</th>
                <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">Kg</th>
                <th className="p-3 text-left font-semibold text-text-secondary hidden lg:table-cell">Saat</th>
                <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => {
                const locked = e.exitItems?.length > 0
                return (
                  <tr key={e.id} className={e.weak ? 'bg-error/5' : 'hover:bg-gray-50'}>
                    <td className="p-2 sm:p-3 font-medium text-text-primary">
                      <div className="flex flex-col">
                        <span>{e.product?.name ?? '—'}</span>
                        <span className="md:hidden text-[10px] text-text-muted">
                          {e.market ? (e.market.no === 0 ? 'Depo' : `#${e.market.no}`) : '—'}
                          {e.weak && <span className="ml-1 text-error">⚠</span>}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-text-secondary hidden md:table-cell">
                      {e.market ? (e.market.no === 0 ? 'Depo' : `#${e.market.no} ${e.market.name}`) : '—'}
                      {e.weak && (
                        <Badge variant="error" className="ml-2 inline-flex items-center gap-1 text-[10px]">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Zayıf
                        </Badge>
                      )}
                    </td>
                    <td className="p-2 sm:p-3 text-right tabular-nums font-semibold">{e.caseCount}</td>
                    <td className="p-2 sm:p-3 text-right tabular-nums">{formatWeight(e.weight)}</td>
                    <td className="p-3 text-text-muted text-xs whitespace-nowrap hidden lg:table-cell">
                      {formatDate(e.createdAt)}
                    </td>
                    <td className="p-2 sm:p-3 text-right">
                      {locked ? (
                        <span className="text-[10px] sm:text-xs text-text-muted">İrsaliyede</span>
                      ) : (
                        <div className="inline-flex gap-1">
                          <button
                            onClick={() => setEditTarget(e)}
                            className="p-2 rounded-lg hover:bg-primary-light text-primary"
                            title="Düzenle"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(e)}
                            className="p-2 rounded-lg hover:bg-red-50 text-error"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <EditEntryModal
        entry={editTarget}
        markets={markets}
        onClose={() => setEditTarget(null)}
        onSaved={handleEdited}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Girişi Sil"
        description={deleteTarget
          ? `${deleteTarget.caseCount} kasa ${deleteTarget.product?.name ?? 'ürün'} silinecek. Şoför bakiyesinden geri eklenecek. Onaylıyor musun?`
          : ''}
        confirmLabel="Evet, Sil"
      />
    </div>
  )
}

function EditEntryModal({ entry, markets, onClose, onSaved }) {
  const [caseCount, setCaseCount] = useState('')
  const [weight, setWeight] = useState('')
  const [marketQuery, setMarketQuery] = useState('')
  const [marketId, setMarketId] = useState(null)
  const [weak, setWeak] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    if (entry) {
      setCaseCount(String(entry.caseCount ?? ''))
      setWeight(String(entry.weight ?? ''))
      setMarketId(entry.marketId)
      setMarketQuery(entry.market ? (entry.market.no === 0 ? 'Depo' : String(entry.market.no)) : '')
      setWeak(!!entry.weak)
      setError('')
    }
  }, [entry])

  async function handleSave() {
    setError('')
    const c = Number(caseCount)
    const w = Number(weight)
    if (!Number.isInteger(c) || c < 1) { setError('Kasa adedi pozitif tam sayı olmalı'); return }
    if (!Number.isFinite(w) || w <= 0) { setError('Ağırlık pozitif olmalı'); return }
    if (!marketId) { setError('Pazar seçilmeli'); return }
    setSaving(true)
    try {
      const updated = await api.updateEntry(entry.id, {
        caseCount: c,
        weight: w,
        marketId,
        weak,
      })
      const delta = c - entry.caseCount
      addToast('Giriş güncellendi ✓')
      onSaved(updated, delta)
    } catch (err) {
      setError(err.response?.data?.error ?? 'Güncelleme başarısız')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={!!entry} onClose={onClose} title="Girişi Düzenle">
      {entry && (
        <div className="flex flex-col gap-4">
          <div className="bg-gray-50 rounded-xl p-3 text-sm">
            <p>
              <span className="font-semibold">{entry.product?.name}</span>
              {entry.producer && <span className="text-text-muted"> · {entry.producer.name}</span>}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Kasa"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={caseCount}
              onChange={(e) => setCaseCount(e.target.value.replace(/\D/g, ''))}
            />
            <Input
              label="Kilo (kg)"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>

          <MarketAutocomplete
            label="Pazar"
            markets={markets}
            value={marketQuery}
            onChange={setMarketQuery}
            onSelect={(m) => {
              if (m) { setMarketId(m.id); setMarketQuery(m.no === 0 ? 'Depo' : String(m.no)) }
              else setMarketId(null)
            }}
          />

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={weak}
              onChange={(e) => setWeak(e.target.checked)}
              className="w-4 h-4 rounded accent-error"
            />
            <span className="text-sm text-text-secondary">Zayıf mal olarak işaretle</span>
          </label>

          {error && <p className="text-sm text-error">{error}</p>}

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
            <Button onClick={handleSave} loading={saving}>Kaydet</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
