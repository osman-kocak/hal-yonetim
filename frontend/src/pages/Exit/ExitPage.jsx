import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/utils/cn'

export function ExitPage() {
  const [markets, setMarkets] = useState([])
  const [loading, setLoading] = useState(true)
  const addToast = useToastStore((s) => s.addToast)
  const navigate = useNavigate()

  useEffect(() => {
    // Çıkış ekranı bekleyen kasa sayısını gösteriyor → withPending
    api.getMarketsWithPending()
      // isSpecial: DEPO (0) ve ATILAN (99) — ikisine de irsaliye kesilemez
      .then((all) => setMarkets((all ?? []).filter((m) => !m.isSpecial)))
      .catch(() => addToast('Pazarlar yüklenemedi', 'error'))
      .finally(() => setLoading(false))
  }, [])

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
        <div className="flex items-center gap-3 max-w-5xl mx-auto">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg hover:bg-gray-100 text-text-muted shrink-0"
            title="Ana sayfaya dön"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-2xl">📋</span>
          <h1 className="text-lg font-bold text-text-primary">ÇIKIŞ / İRSALİYE</h1>
        </div>
      </header>

      <main className="p-4 sm:p-6 max-w-5xl mx-auto">
        <h2 className="text-xl font-bold text-text-primary mb-6">Pazar Seçin</h2>
        {!markets.length ? (
          <EmptyState icon="🏪" title="Pazar bulunamadı" description="Admin panelinden pazar ekleyin" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {markets.map((m) => (
              <button
                key={m.id}
                onClick={() => navigate(`/cikis/${m.id}`)}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all',
                  'min-h-[120px] w-full font-medium text-center shadow-card',
                  'hover:shadow-card-hover active:scale-95',
                  m.pendingCount > 0
                    ? 'border-border bg-card hover:border-primary/40 text-text-primary'
                    : 'border-border bg-gray-50 text-text-muted'
                )}
              >
                <span className="text-2xl font-bold text-primary">#{m.no}</span>
                <span className="text-sm font-semibold">{m.name}</span>
                {m.pendingCount > 0 ? (
                  <Badge variant="warning">{m.pendingCount} bekleyen</Badge>
                ) : (
                  <Badge variant="default">Boş</Badge>
                )}
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
