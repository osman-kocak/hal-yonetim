import { useEffect, useState } from 'react'
import { api, isNetworkError } from '@/services/api'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'
import { SelectCard } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { AlertTriangle, ArrowLeft } from 'lucide-react'

export function ProducerSelect() {
  const activeSession = useAppStore((s) => s.activeSession)
  const regionId = activeSession?.region?.id
  const regionName = activeSession?.region?.name

  const [producers, setProducers] = useState([])
  const [loading, setLoading] = useState(true)
  const selectProducer = useAppStore((s) => s.selectProducer)
  const backToRegions = useAppStore((s) => s.backToRegions)
  const addToast = useToastStore((s) => s.addToast)

  // Üretici bulunamayan bölgede de görünmeli — yoksa kullanıcı ekranda sıkışıyor.
  const backButton = (
    <button
      type="button"
      onClick={backToRegions}
      className="flex items-center gap-1 text-text-muted hover:text-text-primary text-sm mb-6"
    >
      <ArrowLeft className="w-4 h-4" /> Bölge listesine dön
    </button>
  )

  // ULAŞILAMADI ile "bu bölgeye üretici atanmamış" AYNI ŞEY DEĞİL. Eskiden ikisi
  // de boş liste oluyordu ve kesintide ekran "admin panelinden üretici atayın"
  // diyordu — operatörü yanlış yere yönlendiriyordu. Offline'da yeni bölge
  // açılabildiği için (2026-08-18) bu durum artık gerçekten yaşanıyor.
  const [ulasilamadi, setUlasilamadi] = useState(false)

  useEffect(() => {
    if (!regionId) { setLoading(false); return }
    setLoading(true)
    setUlasilamadi(false)
    api.getProducersForRegion(regionId)
      .then(setProducers)
      .catch((err) => {
        if (isNetworkError(err)) setUlasilamadi(true)
        else addToast('Üreticiler yüklenemedi', 'error')
      })
      .finally(() => setLoading(false))
  }, [regionId])

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
        {backButton}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-600 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-amber-900 mb-2">
            {ulasilamadi
              ? 'Üretici listesi indirilemedi'
              : `${regionName ?? 'Bu bölge'} için üretici bulunamadı`}
          </h2>
          <p className="text-sm text-amber-800">
            {ulasilamadi ? (
              <>
                Bağlantı yok ve bu bölgenin üreticileri daha önce indirilmemiş.
                Bağlantı gelince liste kendiliğinden yüklenir; bir kez bağlanıldığında
                tüm bölgelerin üreticileri cihaza kaydedilir.
              </>
            ) : (
              <>
                Admin panelinden <span className="font-semibold">Üreticiler</span> sayfasına gidip
                bu bölgeye üretici atanmalı.
              </>
            )}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {backButton}
      <h2 className="text-xl font-bold text-text-primary mb-2">Üretici Seçin</h2>
      <p className="text-sm text-text-muted mb-6">
        {regionName} bölgesinde {producers.length} üretici
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {producers.map((p) => (
          <SelectCard
            key={p.id}
            label={p.name}
            sublabel={p.allRegions ? 'Tüm bölgeler' : undefined}
            icon="👤"
            onClick={() => selectProducer(p)}
          />
        ))}
      </div>
    </div>
  )
}
