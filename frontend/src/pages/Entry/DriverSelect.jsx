import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'
import { SelectCard } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'

export function DriverSelect() {
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(null)
  const startSession = useAppStore((s) => s.startSession)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    api.getDrivers()
      .then(setDrivers)
      .catch(() => addToast('Şoförler yüklenemedi', 'error'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSelect(driver) {
    setStarting(driver.id)
    try {
      const session = await api.startVehicle(driver.id)
      startSession(session)
    } catch {
      addToast('Araç oturumu başlatılamadı', 'error')
    } finally {
      setStarting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    )
  }

  if (!drivers.length) {
    return <EmptyState icon="🚚" title="Henüz şoför eklenmemiş" description="Admin panelinden şoför ekleyin" />
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-text-primary mb-6">Şoför Seçin</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {drivers.map((d) => (
          <SelectCard
            key={d.id}
            label={d.name}
            sublabel={d.hasActiveSession ? '↩ Devam et' : undefined}
            icon={starting === d.id ? '⏳' : d.hasActiveSession ? '🔄' : '🚚'}
            selected={false}
            disabled={!!starting}
            onClick={() => handleSelect(d)}
          />
        ))}
      </div>
    </div>
  )
}
