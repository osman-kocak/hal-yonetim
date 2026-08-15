import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useConnectionStore } from '@/store/connectionStore'

// Bağlantı kesildiğinde ekranın üstünde kalıcı kırmızı şerit.
//
// NEDEN KALICI: Toast 3.5 sn sonra kayboluyor; operatör kesintiyi kaçırıp
// girdiğini kaydedildi sanıyordu. Kesinti sürdükçe şerit durur ve ne kadar
// süredir bağlantısız olduğumuzu yazar.
//
// Uygulama offline ÇALIŞMIYOR — bu şerit "verilerin gitmedi" uyarısıdır,
// bir kuyruk göstergesi değil.
export function OfflineBanner() {
  const online = useConnectionStore((s) => s.online)
  const offlineSince = useConnectionStore((s) => s.offlineSince)

  if (online || !offlineSince) return null
  // key: yeni kesintide sayaç sıfırdan başlasın (effect'te setState yerine remount)
  return <Banner key={offlineSince} since={offlineSince} />
}

function Banner({ since }) {
  const [seconds, setSeconds] = useState(0)

  // Date.now() yalnızca interval callback'inde: render içinde çağrılırsa bileşen
  // saf olmaz, effect gövdesinde çağrılırsa zincirleme render tetikler.
  useEffect(() => {
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - since) / 1000)), 1000)
    return () => clearInterval(id)
  }, [since])

  const label = seconds < 60
    ? `${seconds} sn`
    : `${Math.floor(seconds / 60)} dk ${seconds % 60} sn`

  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-error text-white px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 shadow-lg">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>
        Bağlantı yok — <strong>{label}</strong>. Girdiğin veriler kaydedilmiyor,
        bağlantı gelince tekrar dene.
      </span>
    </div>
  )
}
