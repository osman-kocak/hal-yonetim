import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Badge } from '@/components/ui/Badge'
import { formatDate, today } from '@/utils/formatters'

export function PricesPage() {
  const [date, setDate] = useState(today())
  const [products, setProducts] = useState([])
  const [qualities, setQualities] = useState([])
  const [prices, setPrices] = useState({})
  const [lastUpdate, setLastUpdate] = useState(null)  // { updatedAt, updatedBy }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    Promise.all([api.getAdminProducts(), api.getQualities_admin()])
      .then(([p, q]) => { setProducts(p); setQualities(q) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    api.getPrices(date).then((list) => {
      const map = {}
      list.forEach((p) => { map[`${p.productId}_${p.qualityId}`] = String(p.pricePerKg) })
      setPrices(map)

      // En son güncellenen kaydı bul
      if (list.length) {
        const latest = list.reduce((a, b) => (new Date(a.updatedAt) > new Date(b.updatedAt) ? a : b))
        setLastUpdate(latest.updatedAt ? { updatedAt: latest.updatedAt, updatedBy: latest.updatedBy } : null)
      } else {
        setLastUpdate(null)
      }
    })
  }, [date])

  function handleChange(productId, qualityId, value) {
    setPrices((prev) => ({ ...prev, [`${productId}_${qualityId}`]: value }))
  }

  async function handleBlur(productId, qualityId) {
    const key = `${productId}_${qualityId}`
    const raw = prices[key]
    if (raw === '' || raw === undefined) return
    const pricePerKg = parseFloat(raw)
    if (isNaN(pricePerKg) || pricePerKg < 0) return
    setSaving(key)
    try {
      const saved = await api.upsertPrice({ productId, qualityId, pricePerKg, date })
      if (saved.updatedAt) {
        setLastUpdate({ updatedAt: saved.updatedAt, updatedBy: saved.updatedBy })
      }
    } catch {
      addToast('Fiyat kaydedilemedi', 'error')
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><LoadingSpinner size="lg" className="text-primary" /></div>
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-text-primary">💰 Günlük Fiyatlar</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {lastUpdate && (
        <div className="mb-4 px-4 py-2.5 bg-primary-light rounded-xl text-sm text-primary-dark flex items-center gap-2">
          <span className="font-semibold">Son güncelleme:</span>
          <span>{formatDate(lastUpdate.updatedAt)}</span>
          {lastUpdate.updatedBy && (
            <span>— <span className="font-semibold">{lastUpdate.updatedBy}</span> tarafından</span>
          )}
        </div>
      )}

      <p className="text-sm text-text-muted mb-6">
        Fiyat alanını doldurup çıkınca otomatik kaydedilir. Boş bırakılan ürünler irsaliyede "—" olarak görünür.
      </p>

      <div className="bg-white border border-border rounded-2xl shadow-card overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-gray-50 border-b border-border">
            <tr>
              <th className="p-2 sm:p-4 text-left font-semibold text-text-secondary">Ürün</th>
              {qualities.map((q) => (
                <th key={q.id} className="p-2 sm:p-4 text-center font-semibold text-text-secondary">
                  <Badge variant={q.name === 'A' ? 'quality-a' : 'quality-b'}>{q.name}</Badge>
                  <span className="block text-[10px] sm:text-xs font-normal text-text-muted mt-0.5">₺ / kg</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="p-2 sm:p-4 font-medium text-text-primary">{p.name}</td>
                {qualities.map((q) => {
                  const key = `${p.id}_${q.id}`
                  const isSaving = saving === key
                  return (
                    <td key={q.id} className="p-2 sm:p-3 text-center">
                      <div className="relative inline-flex items-center">
                        <span className="absolute left-2 sm:left-3 text-text-muted text-xs sm:text-sm">₺</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="—"
                          value={prices[key] ?? ''}
                          onChange={(e) => handleChange(p.id, q.id, e.target.value)}
                          onBlur={() => handleBlur(p.id, q.id)}
                          className="w-20 sm:w-28 pl-6 sm:pl-7 pr-2 sm:pr-3 py-2 rounded-lg border border-border text-right text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        />
                        {isSaving && (
                          <span className="absolute -right-5 sm:-right-6">
                            <LoadingSpinner size="sm" className="text-primary" />
                          </span>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
