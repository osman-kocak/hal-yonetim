import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { generateIrsaliye } from '@/utils/pdfGenerator'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatWeight, today } from '@/utils/formatters'
import { ArrowLeft, FileText } from 'lucide-react'

const REFRESH_INTERVAL = 10

export function MarketExitDetail() {
  const { marketId } = useParams()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)

  const [entries, setEntries] = useState([])
  const [market, setMarket] = useState(null)
  const [priceMap, setPriceMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)

  // Mevcut entry ID'lerini ref'te tut — interval closure'da stale olmadan okuyabilmek için
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  async function fetchEntries(isInitial = false) {
    try {
      const [markets, fresh] = await Promise.all([
        isInitial ? api.getMarkets() : Promise.resolve(null),
        api.getMarketEntries(marketId),
      ])

      if (isInitial && markets) {
        setMarket(markets.find((m) => m.id === Number(marketId)))
      }

      setEntries(fresh)
      // Checked bilgisini koru — sadece yeni gelenler unchecked olarak eklenir
      // Hiçbir şey pre-check etme
      setCountdown(REFRESH_INTERVAL)
    } catch {
      if (isInitial) addToast('Veriler yüklenemedi', 'error')
    } finally {
      if (isInitial) setLoading(false)
    }
  }

  useEffect(() => {
    fetchEntries(true)
    api.getPublicPrices(today()).then(setPriceMap).catch(() => {})
  }, [marketId])

  // Countdown + periyodik yenileme — sekme arka plandaysa veya seçim varsa pause
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return // arka planda pause
      setCountdown((prev) => {
        if (prev <= 1) {
          // Kullanıcı bir şey seçtiyse yenilemeyi atla (seçim kaybolmasın)
          if (selectedRef.current.size === 0) {
            fetchEntries(false)
          }
          return REFRESH_INTERVAL
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [marketId])

  function toggleAll(checked) {
    setSelected(checked ? new Set(entries.map((e) => e.id)) : new Set())
  }

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleCreateExit() {
    if (market?.no === 0) { addToast('Depoya irsaliye kesilemez', 'error'); return }
    if (!selected.size) { addToast('En az bir ürün seçin', 'error'); return }
    setSubmitting(true)
    try {
      const exit = await api.createExit(Number(marketId), [...selected])
      await generateIrsaliye(exit)
      addToast('İrsaliye oluşturuldu, PDF indiriliyor ✓')
      navigate('/cikis')
    } catch (err) {
      addToast(err.response?.data?.error ?? 'İrsaliye oluşturulamadı', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    )
  }

  // Depo (no=0) için irsaliye kesilemez — kullanıcıyı bilgilendir
  if (market?.no === 0) {
    return (
      <div className="min-h-screen bg-bg">
        <header className="bg-white border-b border-border px-4 py-4">
          <div className="max-w-5xl mx-auto flex items-center gap-4">
            <button onClick={() => navigate('/cikis')} className="p-2 rounded-lg hover:bg-gray-100 text-text-muted">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-text-primary">Depo</h1>
          </div>
        </header>
        <main className="p-4 sm:p-6 max-w-5xl mx-auto">
          <EmptyState
            icon="📦"
            title="Depoya irsaliye kesilemez"
            description="Depo bir pazar değil — buradaki ürünleri pazarlara aktarmak için Depo Transfer sayfasını kullan."
            action={<Button onClick={() => navigate('/depo')}>Depo Transfer'e git</Button>}
          />
        </main>
      </div>
    )
  }

  const totalCases = entries.filter((e) => selected.has(e.id)).reduce((s, e) => s + e.caseCount, 0)
  const totalWeight = entries.filter((e) => selected.has(e.id)).reduce((s, e) => s + e.weight, 0)

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-white border-b border-border px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/cikis')} className="p-2 rounded-lg hover:bg-gray-100 text-text-muted">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-text-primary leading-none">
                {market ? `Pazar #${market.no} — ${market.name}` : 'Pazar'}
              </h1>
              <p className="text-sm text-text-muted">{entries.length} bekleyen giriş</p>
            </div>
          </div>
          {/* Countdown */}
          <span className="text-xs text-text-muted bg-gray-100 rounded-full px-3 py-1 tabular-nums">
            🔄 {countdown}s
          </span>
        </div>
      </header>

      <main className="p-4 sm:p-6 max-w-5xl mx-auto">
        {!entries.length ? (
          <EmptyState
            icon="✅"
            title="Bu pazarda bekleyen giriş yok"
            description="Tüm girişler irsaliye edilmiş"
            action={<Button variant="outline" onClick={() => navigate('/cikis')}>Geri Dön</Button>}
          />
        ) : (
          <>
            <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-card mb-6">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-gray-50 border-b border-border">
                  <tr>
                    <th className="p-2 sm:p-4 text-left w-10 sm:w-12">
                      <input
                        type="checkbox"
                        checked={selected.size > 0 && selected.size === entries.length}
                        onChange={(e) => toggleAll(e.target.checked)}
                        className="w-4 h-4 rounded accent-primary"
                      />
                    </th>
                    <th className="p-2 sm:p-4 text-left font-semibold text-text-secondary">Ürün</th>
                    <th className="p-4 text-left font-semibold text-text-secondary hidden md:table-cell">Kalite</th>
                    <th className="p-2 sm:p-4 text-right font-semibold text-text-secondary">Kasa</th>
                    <th className="p-2 sm:p-4 text-right font-semibold text-text-secondary hidden sm:table-cell">Kilo</th>
                    <th className="p-4 text-right font-semibold text-text-secondary hidden md:table-cell">₺/kg</th>
                    <th className="p-4 text-left font-semibold text-text-secondary hidden lg:table-cell">Tarih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.map((entry) => (
                    <tr
                      key={entry.id}
                      onClick={() => toggle(entry.id)}
                      className="cursor-pointer hover:bg-primary-light/30 transition-colors"
                    >
                      <td className="p-4">
                        <input
                          type="checkbox"
                          checked={selected.has(entry.id)}
                          onChange={() => toggle(entry.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded accent-primary"
                        />
                      </td>
                      <td className="p-2 sm:p-4 font-medium text-text-primary">
                        <div className="flex flex-col">
                          <span>{entry.product?.name ?? '—'}</span>
                          <span className="sm:hidden text-[10px] text-text-muted">
                            {formatWeight(entry.weight)}
                            {priceMap[`${entry.productId}_${entry.qualityId}`] && ` · ₺${Number(priceMap[`${entry.productId}_${entry.qualityId}`]).toFixed(2)}/kg`}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        {entry.quality ? (
                          <Badge variant={entry.quality.name === 'A' ? 'quality-a' : 'quality-b'}>
                            {entry.quality.name}
                          </Badge>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="p-2 sm:p-4 text-right text-text-primary tabular-nums">{entry.caseCount}</td>
                      <td className="p-2 sm:p-4 text-right text-text-primary tabular-nums hidden sm:table-cell">{formatWeight(entry.weight)}</td>
                      <td className="p-4 text-right text-text-muted hidden md:table-cell">
                        {priceMap[`${entry.productId}_${entry.qualityId}`]
                          ? `₺${Number(priceMap[`${entry.productId}_${entry.qualityId}`]).toFixed(2)}`
                          : '—'}
                      </td>
                      <td className="p-4 text-text-muted hidden lg:table-cell">{formatDate(entry.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-border rounded-2xl p-5 shadow-card">
              <div className="flex gap-6">
                <div>
                  <p className="text-xs text-text-muted">Seçili Kasa</p>
                  <p className="text-xl font-bold text-text-primary">{totalCases}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Seçili Ağırlık</p>
                  <p className="text-xl font-bold text-text-primary">{formatWeight(totalWeight)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Seçili Kalem</p>
                  <p className="text-xl font-bold text-text-primary">{selected.size}</p>
                </div>
              </div>
              <Button
                size="xl"
                onClick={handleCreateExit}
                loading={submitting}
                disabled={!selected.size}
                className="flex items-center gap-2"
              >
                <FileText className="w-5 h-5" />
                İrsaliye Oluştur
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
