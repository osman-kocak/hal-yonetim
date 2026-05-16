import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'
import { DriverSelect } from './DriverSelect'
import { ProducerSelect } from './ProducerSelect'
import { ProductSelect } from './ProductSelect'
import { EntryForm } from './EntryForm'
import { RecentEntriesList } from './RecentEntriesList'
import { Clock } from '@/components/ui/Clock'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { CheckCircle, Truck, User, Boxes } from 'lucide-react'

export function EntryPage() {
  const { step, activeSession, selectedProducer, completeSession, driverBalance, setDriverBalance } = useAppStore()
  const addToast = useToastStore((s) => s.addToast)
  const [completing, setCompleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [summary, setSummary] = useState(null) // { entries, totalCases, totalWeight, finalBalance }
  const [clearBalance, setClearBalance] = useState(false)

  // Aktif şoför değişince bakiye çek
  useEffect(() => {
    if (!activeSession?.driver?.id) { setDriverBalance(null); return }
    let cancelled = false
    api.getCaseDriverBalances()
      .then((list) => {
        if (cancelled) return
        const d = (list ?? []).find((x) => x.id === activeSession.driver.id)
        setDriverBalance(d?.balance ?? 0)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [activeSession?.driver?.id, setDriverBalance, step])

  async function openCompleteConfirm() {
    // Araç bilançosunu hazırla
    try {
      const [entriesList, balances] = await Promise.all([
        api.getCaseMovements({ driverId: activeSession.driver.id }),
        api.getCaseDriverBalances(),
      ])
      const sessionMovements = (entriesList ?? []).filter((m) => m.note?.includes('Mal kabul'))
      const totalCases = sessionMovements.reduce((s, m) => s + (m.qty ?? 0), 0)
      const finalBalance = balances.find((d) => d.id === activeSession.driver.id)?.balance ?? 0
      setSummary({
        entryCount: sessionMovements.length,
        totalCases,
        finalBalance,
      })
    } catch {
      setSummary({ entryCount: '?', totalCases: '?', finalBalance: driverBalance ?? 0 })
    }
    setConfirmOpen(true)
  }

  async function handleComplete() {
    setCompleting(true)
    try {
      await api.completeVehicle(activeSession.id, { clearBalance })
      addToast(clearBalance ? 'Araç tamamlandı ve bakiye sıfırlandı ✓' : 'Araç tamamlandı ✓')
      completeSession()
    } catch {
      addToast('İşlem başarısız', 'error')
    } finally {
      setCompleting(false)
      setConfirmOpen(false)
      setSummary(null)
      setClearBalance(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="bg-white border-b border-border px-3 sm:px-4 py-3 sm:py-4 flex flex-wrap items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 order-1">
          <span className="text-xl sm:text-2xl shrink-0">🌿</span>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-text-primary leading-none">MAL KABUL</h1>
            {activeSession && (
              <p className="text-xs sm:text-sm text-text-muted mt-1 flex items-center gap-1 flex-wrap">
                <Truck className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[120px] sm:max-w-none">{activeSession.driver.name}</span>
                {driverBalance != null && (
                  <Badge
                    variant={driverBalance < 0 ? 'error' : driverBalance === 0 ? 'default' : 'success'}
                    className="inline-flex items-center gap-1"
                  >
                    <Boxes className="w-3 h-3" />
                    {driverBalance}
                  </Badge>
                )}
                {selectedProducer && (
                  <>
                    <span className="text-text-muted/50">·</span>
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate max-w-[120px] sm:max-w-none">{selectedProducer.name}</span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
        <Clock className="shrink-0 order-2 sm:order-3" />
        {activeSession && (
          <button
            type="button"
            onClick={openCompleteConfirm}
            className="justify-center rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed bg-error text-white hover:bg-red-700 active:bg-red-800 px-4 py-2 text-sm flex items-center gap-1.5 sm:gap-2 order-3 sm:order-2 w-full sm:w-auto sm:ml-auto"
          >
            <CheckCircle className="w-4 h-4" />
            Araç Bitti
          </button>
        )}
      </header>

      <main className="p-4 sm:p-6 max-w-5xl mx-auto">
        {step === 'driver_select' && <DriverSelect />}
        {step === 'producer_select' && <ProducerSelect />}
        {step === 'product_select' && <ProductSelect />}
        {step === 'entry_form' && <EntryForm />}

        {activeSession && step !== 'driver_select' && (
          <RecentEntriesList sessionId={activeSession.id} />
        )}
      </main>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Araç Bitti — Bilanço">
        {activeSession && (
          <div className="flex flex-col gap-4">
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2">
              <p className="font-semibold text-text-primary">{activeSession.driver.name}</p>
              <div className="grid grid-cols-2 gap-3 text-text-secondary">
                <div>
                  <p className="text-xs text-text-muted">Mal kabul</p>
                  <p className="text-lg font-bold text-text-primary">{summary?.entryCount ?? '—'} adet</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Teslim alınan kasa</p>
                  <p className="text-lg font-bold text-text-primary">{summary?.totalCases ?? '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-text-muted">Güncel kasa bakiyesi</p>
                  <p className={`text-2xl font-bold ${summary?.finalBalance < 0 ? 'text-error' : 'text-text-primary'}`}>
                    {summary?.finalBalance ?? 0} kasa
                  </p>
                  {summary?.finalBalance < 0 && (
                    <p className="text-xs text-error mt-1">⚠️ Bakiye negatif — sabah verilen kasa girilmemiş olabilir</p>
                  )}
                  {summary?.finalBalance > 0 && (
                    <p className="text-xs text-text-muted mt-1">{summary.finalBalance} kasa hala şoförde</p>
                  )}
                </div>
              </div>
            </div>
            {summary?.finalBalance !== 0 && (
              <label className="flex items-start gap-2 cursor-pointer bg-amber-50 border border-amber-200 rounded-xl p-3">
                <input
                  type="checkbox"
                  checked={clearBalance}
                  onChange={(e) => setClearBalance(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary mt-0.5"
                />
                <span className="text-xs text-amber-900">
                  Şoför bakiyesini ({summary?.finalBalance ?? 0} kasa) sıfırla — DRIVER_ADJUST hareketi yaratılır
                </span>
              </label>
            )}
            <p className="text-sm text-text-muted">Araç tamamlanacak. Bu işlem geri alınamaz.</p>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={completing}>İptal</Button>
              <Button onClick={handleComplete} loading={completing}>Tamamla</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
