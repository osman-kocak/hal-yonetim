import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { formatDate } from '@/utils/formatters'

// Desen yoğunluğu: satır/sütun sayısı sabit tutuldu — viewport'a göre hesaplamak
// resize dinleyicisi gerektirir, kazancı yok. Katman viewport'un 2 katı olduğu
// için -30° döndürüldükten sonra köşeler de doluyor.
const ROWS = 10
const COLS = 4

// Damga dakikada bir tazelenir: saniye hassasiyeti iz sürmeye bir şey katmıyor,
// her saniye render etmek ise iPad'de boşuna iş.
function useMinuteStamp() {
  const [stamp, setStamp] = useState(() => formatDate(Date.now()))

  useEffect(() => {
    let intervalId
    // İlk tetikleme dakika sınırına hizalanıyor — düz 60sn interval'de damga
    // gerçek saatin bir dakika gerisinde takılı kalabilir.
    const timeoutId = setTimeout(() => {
      setStamp(formatDate(Date.now()))
      intervalId = setInterval(() => setStamp(formatDate(Date.now())), 60_000)
    }, 60_000 - (Date.now() % 60_000))

    return () => {
      clearTimeout(timeoutId)
      clearInterval(intervalId)
    }
  }, [])

  return stamp
}

// Ekranın fotoğrafı çekilirse fotoğraf kimin oturumunda çekildiğini kendi
// üstünde taşısın diye eklendi — engelleme değil, iz sürülebilirlik.
// z-15: sayfa içeriğinin üstünde ama dropdown (z-20), modal (z-50) ve
// toast (z-100) altında — filigran onların okunmasını gölgelemesin.
export function ScreenWatermark() {
  const user = useAuthStore((s) => s.user)
  const stamp = useMinuteStamp()

  // Kimlik yoksa iz sürülecek bir şey de yok (oturum kapanma anı, yönlendirme öncesi)
  if (!user) return null

  const label = [user.name, user.username, stamp].filter(Boolean).join(' · ')

  return (
    <div
      className="fixed inset-0 z-[15] overflow-hidden pointer-events-none select-none print:hidden"
      aria-hidden="true"
    >
      <div className="absolute -inset-[50%] flex flex-col justify-around gap-10 rotate-[-30deg] opacity-[0.08]">
        {Array.from({ length: ROWS }, (_, row) => (
          <div key={row} className="flex justify-around gap-16">
            {Array.from({ length: COLS }, (_, col) => (
              <span
                key={col}
                // Beyaz gölge, koyu zeminli kartlarda/görsellerde de seçilmesini sağlıyor
                className="text-sm font-semibold tracking-wide whitespace-nowrap text-text-primary [text-shadow:0_1px_0_rgba(255,255,255,0.6)]"
              >
                {label}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// Saha rotalarını saran pathless layout — filigranın kapsamı route tablosunda
// tek bakışta görünsün diye rol yerine route'a bağlandı. ADMIN kullanıcısı
// /mal-kabul'e girdiğinde de filigran çıkar; korunan şey kişi değil, ekran.
export function WatermarkedLayout() {
  return (
    <>
      <Outlet />
      <ScreenWatermark />
    </>
  )
}
