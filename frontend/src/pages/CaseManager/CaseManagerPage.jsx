import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Truck, Store, LogOut, RefreshCw, ArrowLeft } from 'lucide-react'

export function CaseManagerPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const addToast = useToastStore((s) => s.addToast)

  const [driverBalances, setDriverBalances] = useState([])
  const [marketBalances, setMarketBalances] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const [d, m] = await Promise.all([
        api.getCaseDriverBalances(),
        api.getCaseMarketBalances(),
      ])
      setDriverBalances(d ?? [])
      setMarketBalances((m ?? []).filter((x) => x.no !== 0))
    } catch {
      addToast('Bakiyeler yüklenemedi', 'error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  function handleLogout() {
    logout()
    navigate('/giris')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-white border-b border-border px-4 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-gray-100 text-text-muted">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <span className="text-2xl">🧺</span>
            <div>
              <h1 className="text-lg font-bold text-text-primary leading-none">Kasacı Paneli</h1>
              {user?.name && <p className="text-xs text-text-muted mt-1">{user.name}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={load} loading={refreshing} className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Yenile
            </Button>
            <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-gray-100 text-text-muted" title="Çıkış">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-6 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CaseMovementForm
          title="Şoföre Kasa Ver"
          icon={Truck}
          accent="text-emerald-600"
          accentBg="bg-emerald-50"
          targetLabel="Şoför"
          options={driverBalances.map((d) => ({ id: d.id, label: d.name, balance: d.balance }))}
          movementType="DRIVER_OUT"
          targetKey="driverId"
          onSubmitted={load}
        />
        <CaseMovementForm
          title="Pazardan İade Al"
          icon={Store}
          accent="text-amber-600"
          accentBg="bg-amber-50"
          targetLabel="Pazar"
          options={marketBalances.map((m) => ({ id: m.id, label: `#${m.no} ${m.name}`, balance: m.balance }))}
          movementType="MARKET_IN"
          targetKey="marketId"
          onSubmitted={load}
        />

        <BalanceList title="Şoför Bakiyeleri" rows={driverBalances.map((d) => ({ key: d.id, label: d.name, balance: d.balance }))} />
        <BalanceList title="Pazar Bakiyeleri" rows={marketBalances.map((m) => ({ key: m.id, label: `#${m.no} ${m.name}`, balance: m.balance }))} />
      </main>
    </div>
  )
}

function CaseMovementForm({ title, icon: Icon, accent, accentBg, targetLabel, options, movementType, targetKey, onSubmitted }) {
  const [targetId, setTargetId] = useState('')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const addToast = useToastStore((s) => s.addToast)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!targetId) { setError(`${targetLabel} seçilmeli`); return }
    const n = Number(qty)
    if (!Number.isInteger(n) || n <= 0) { setError('Kasa adedi pozitif tam sayı olmalı'); return }
    setSubmitting(true)
    try {
      await api.createCaseMovement({
        type: movementType,
        qty: n,
        [targetKey]: Number(targetId),
        note: note.trim() || undefined,
      })
      addToast(`${n} kasa kaydedildi ✓`)
      setQty(''); setNote(''); setTargetId('')
      onSubmitted?.()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Kayıt başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white border border-border rounded-2xl shadow-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-10 h-10 rounded-xl ${accentBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${accent}`} />
        </div>
        <h2 className="text-lg font-bold text-text-primary">{title}</h2>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-text-secondary">{targetLabel}</label>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-border bg-white text-text-primary text-base focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Seçin…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label} {o.balance != null ? `(bakiye: ${o.balance})` : ''}
              </option>
            ))}
          </select>
        </div>

        <Input
          label="Kasa Adedi"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="0"
        />

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

        <Button type="submit" size="lg" loading={submitting} className="w-full mt-1">
          Kaydet
        </Button>
      </form>
    </div>
  )
}

function BalanceList({ title, rows }) {
  const total = rows.reduce((s, r) => s + (r.balance ?? 0), 0)
  return (
    <div className="bg-white border border-border rounded-2xl shadow-card p-6">
      <div className="flex items-baseline justify-between mb-4 gap-3">
        <h2 className="text-lg font-bold text-text-primary">{title}</h2>
        <p className="text-sm text-text-muted">
          Toplam kasa: <span className={`font-bold tabular-nums ${total < 0 ? 'text-error' : 'text-text-primary'}`}>{total}</span>
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">Kayıt yok</p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.key} className="py-2 flex items-center justify-between text-sm">
              <span className="text-text-primary">{r.label}</span>
              <span className={`font-semibold tabular-nums ${r.balance < 0 ? 'text-error' : r.balance > 0 ? 'text-text-primary' : 'text-text-muted'}`}>
                {r.balance ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
