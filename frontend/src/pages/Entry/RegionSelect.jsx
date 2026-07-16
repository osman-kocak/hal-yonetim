import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'
import { SelectCard } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'

export function RegionSelect() {
  const [regions, setRegions] = useState([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(null)
  const startSession = useAppStore((s) => s.startSession)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    api.getRegions()
      .then(setRegions)
      .catch(() => addToast('Bölgeler yüklenemedi', 'error'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSelect(region) {
    setStarting(region.id)
    try {
      const session = await api.startRegion(region.id)
      startSession(session)
    } catch {
      addToast('Bölge oturumu başlatılamadı', 'error')
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

  if (!regions.length) {
    return <EmptyState icon="📍" title="Henüz bölge eklenmemiş" description="Admin panelinden bölge ekleyin" />
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-text-primary mb-6">Bölge Seçin</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {regions.map((r) => (
          <SelectCard
            key={r.id}
            label={r.name}
            sublabel={r.hasActiveSession ? '↩ Devam et' : undefined}
            icon={starting === r.id ? '⏳' : r.hasActiveSession ? '🔄' : '📍'}
            selected={false}
            disabled={!!starting}
            onClick={() => handleSelect(r)}
          />
        ))}
      </div>
    </div>
  )
}
