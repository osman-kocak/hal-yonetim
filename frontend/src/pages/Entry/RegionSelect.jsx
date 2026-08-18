import { useEffect, useState } from 'react'
import { api, isNetworkError } from '@/services/api'
import { cacheGet } from '@/lib/offlineDb'
import { useAppStore, ACTIVE_SESSION_KEY } from '@/store/appStore'
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
    } catch (err) {
      // Kesintide: sunucudan oturum alınamaz ama AYNI bölgenin daha önce açılmış
      // oturumu yerelde duruyorsa ona dönülebilir. Bu olmadan kesinti sonrası
      // sayfa yenilenince operatör mal kabul formuna hiç ulaşamıyordu — offline
      // kuyruk da boşa çıkıyordu.
      //
      // Yeni bölge açmak offline MÜMKÜN DEĞİL: oturum id'si sunucudan geliyor.
      if (isNetworkError(err)) {
        const hit = await cacheGet(ACTIVE_SESSION_KEY)
        const cached = hit?.data
        if (cached?.id && cached.regionId === region.id) {
          startSession(cached)
          addToast('Bağlantı yok — açık bölgeye çevrimdışı devam ediliyor', 'warning')
          return
        }
        addToast('Bağlantı yok — kesintide yalnızca açık bölgeye devam edilebilir', 'error')
        return
      }
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
