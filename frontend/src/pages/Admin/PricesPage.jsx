import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatDate, today, isCountable, priceLabel } from '@/utils/formatters'

// ÜRÜN BAŞINA TEK FİYAT (2026-08-13). Ekran eskiden ürün × kalite matrisiydi;
// kalite özelliği kullanımdan kalktı ve mal kabul zaten kalite göndermiyordu —
// yani kaliteli fiyat satırları saha girişleriyle hiç eşleşmiyor, irsaliyede
// fiyat boş kalıyordu. Artık yazılan fiyat ürünün GENEL fiyatı (Price.qualityId
// null) ve her girişte bulunuyor.
//
// Eski kaliteli satırlar veritabanında duruyor ve arama sırasında hâlâ
// önceliklidir (backend utils/prices.js → priceOf). Bu ekran onları göstermez:
// aynı ürün için iki farklı sayı görünürse hangisinin geçerli olduğu belirsizleşir.
const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

// Price.date @db.Date — UTC gün başı olarak gelir. Yerel saate çevirmek gün
// kaymasına yol açabildiği için UTC bileşenleri okunuyor (bkz. backend date.js).
function shortDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d)) return ''
  return `${d.getUTCDate()} ${AYLAR[d.getUTCMonth()]}`
}

export function PricesPage() {
  const [date, setDate] = useState(today())
  const [products, setProducts] = useState([])
  const [prices, setPrices] = useState({})
  const [lastUpdate, setLastUpdate] = useState(null)  // { updatedAt, updatedBy }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [query, setQuery] = useState('')
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    api.getAdminProducts()
      .then(setProducts)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    api.getPrices(date).then((list) => {
      // Ürün başına tek değer. Genel satır (qualityId null) kazanır; eski
      // kaliteli satır yalnızca genel yoksa kutuyu doldurur — muhasebeci dünkü
      // rakamı görüp üstüne yazabilsin diye.
      //
      // Backend seçilen güne yazılmamış fiyatları önceki günden devrederek
      // döner (inherited). Kutuda görünen rakam o gün gerçekten geçerli olandır;
      // not satırı hangi tarihten geldiğini söyler ki muhasebeci "bu fiyatı ben
      // bugün mü girdim" diye tereddüt etmesin.
      const map = {}
      list.forEach((p) => {
        const value = String(p.pricePerKg)
        const cell = { value, original: value, inherited: p.inherited, from: p.date }
        if (p.qualityId == null) map[p.productId] = cell
        else if (map[p.productId] === undefined) map[p.productId] = cell
      })
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

  function handleChange(productId, value) {
    setPrices((prev) => ({ ...prev, [productId]: { ...prev[productId], value } }))
  }

  async function handleBlur(productId) {
    const cell = prices[productId]
    const raw = cell?.value
    if (raw === '' || raw === undefined) return
    const pricePerKg = parseFloat(raw)
    if (isNaN(pricePerKg) || pricePerKg < 0) return
    // Rakam değişmediyse kaydetme. Devralınan fiyat kutuda dolu göründüğü için
    // muhasebeci alanlar arasında gezinirken her blur bir yazma tetiklerdi:
    // fiyat geçmişi "değişmedi" satırlarıyla şişer ve son güncelleme bilgisi
    // yanıltıcı olur — carry-forward zaten okuma tarafında çalışıyor.
    if (raw === cell.original) return
    setSaving(productId)
    try {
      // qualityId gönderilmiyor → backend genel fiyat yazar
      const saved = await api.upsertPrice({ productId, pricePerKg, date })
      setPrices((prev) => ({
        ...prev,
        [productId]: { value: raw, original: raw, inherited: false, from: saved.date },
      }))
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

  const q = query.trim().toLowerCase()
  const visible = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
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

      <p className="text-sm text-text-muted mb-4">
        Fiyat alanını doldurup çıkınca otomatik kaydedilir. <strong className="text-text-secondary">Girilen fiyat siz
        değiştirene kadar geçerlidir</strong> — her gün yeniden girmeniz gerekmez; önceki günden devralınan fiyatlar
        kutunun altında tarihiyle belirtilir. Hiç fiyat girilmemiş ürünler irsaliyede "—" olarak görünür.
        Fiyat birimi ürünün satış birimine göre değişir (₺/kg · ₺/bağ · ₺/adet).
      </p>

      <div className="relative mb-4 max-w-md">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ürün ara…"
          className="w-full px-4 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="bg-white border border-border rounded-2xl shadow-card overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-gray-50 border-b border-border">
            <tr>
              <th className="p-2 sm:p-4 text-left font-semibold text-text-secondary">Ürün</th>
              <th className="p-2 sm:p-4 text-right font-semibold text-text-secondary">Fiyat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((p) => {
              const isSaving = saving === p.id
              const cell = prices[p.id]
              return (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-2 sm:p-4 font-medium text-text-primary">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{p.icon || '📦'}</span>
                      <div className="flex flex-col">
                        <span>{p.name}</span>
                        {/* Bağ/adet ürünlerinde fiyat ₺/kg değil ₺/bağ ya da ₺/adet —
                            muhasebeci hangi birime fiyat girdiğini görmeli. */}
                        <span className={`text-[10px] ${isCountable(p.unit) ? 'text-primary font-semibold' : 'text-text-muted'}`}>
                          {priceLabel(p.unit)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="p-2 sm:p-3 text-right">
                    <div className="inline-flex flex-col items-end gap-0.5">
                      <div className="relative inline-flex items-center">
                        <span className="absolute left-2 sm:left-3 text-text-muted text-xs sm:text-sm">₺</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="—"
                          value={cell?.value ?? ''}
                          onChange={(e) => handleChange(p.id, e.target.value)}
                          onBlur={() => handleBlur(p.id)}
                          className="w-24 sm:w-32 pl-6 sm:pl-7 pr-2 sm:pr-3 py-2 rounded-lg border border-border text-right text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        />
                        {isSaving && (
                          <span className="absolute -right-5 sm:-right-6">
                            <LoadingSpinner size="sm" className="text-primary" />
                          </span>
                        )}
                      </div>
                      {/* Devralınan fiyat: kutudaki rakam geçerli ama bu güne
                          yazılmadı. Tarihi göstermezsek muhasebeci fiyatın
                          güncel mi bayat mı olduğunu ayırt edemez. */}
                      {cell?.inherited && (
                        <span className="text-[10px] text-text-muted pr-1">
                          {shortDate(cell.from)}'tan devir
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
