import { useState } from 'react'
import { api } from '@/services/api'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'
import { DriverSelect } from './DriverSelect'
import { ProducerSelect } from './ProducerSelect'
import { ProductSelect } from './ProductSelect'
import { EntryForm } from './EntryForm'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Clock } from '@/components/ui/Clock'
import { CheckCircle, Truck, User } from 'lucide-react'

export function EntryPage() {
  const { step, activeSession, selectedProducer, completeSession } = useAppStore()
  const addToast = useToastStore((s) => s.addToast)
  const [completing, setCompleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function handleComplete() {
    setCompleting(true)
    try {
      await api.completeVehicle(activeSession.id)
      addToast('Araç tamamlandı ✓')
      completeSession()
    } catch {
      addToast('İşlem başarısız', 'error')
    } finally {
      setCompleting(false)
      setConfirmOpen(false)
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
            onClick={() => setConfirmOpen(true)}
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
      </main>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleComplete}
        loading={completing}
        title="Araç Tamamlandı"
        description={`${activeSession?.driver.name} isimli şoförün aracı tamamlanacak. Bu işlem geri alınamaz.`}
        confirmLabel="Tamamla"
      />
    </div>
  )
}
