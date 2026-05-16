import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'
import { SelectCard } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { AlertTriangle } from 'lucide-react'

export function ProducerSelect() {
  const activeSession = useAppStore((s) => s.activeSession)
  const driverId = activeSession?.driver?.id
  const driverName = activeSession?.driver?.name

  const [producers, setProducers] = useState([])
  const [loading, setLoading] = useState(true)
  const selectProducer = useAppStore((s) => s.selectProducer)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    if (!driverId) { setLoading(false); return }
    setLoading(true)
    api.getProducersForDriver(driverId)
      .then(setProducers)
      .catch(() => addToast('Üreticiler yüklenemedi', 'error'))
      .finally(() => setLoading(false))
  }, [driverId])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    )
  }

  if (!producers.length) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-600 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-amber-900 mb-2">
            {driverName ?? 'Bu şoför'} için üretici atanmamış
          </h2>
          <p className="text-sm text-amber-800">
            Admin panelinden <span className="font-semibold">Üreticiler</span> sayfasına gidip
            bu şoföre üretici atanmalı.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-text-primary mb-2">Üretici Seçin</h2>
      <p className="text-sm text-text-muted mb-6">
        {driverName} şoförüne atanmış {producers.length} üretici
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {producers.map((p) => (
          <SelectCard
            key={p.id}
            label={p.name}
            icon="👤"
            onClick={() => selectProducer(p)}
          />
        ))}
      </div>
    </div>
  )
}
