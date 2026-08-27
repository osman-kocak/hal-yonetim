import { useEffect, useMemo, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Segmented } from '@/components/ui/Segmented'
import { formatDate, today } from '@/utils/formatters'
import { TrendingUp, ShoppingCart, UserCog } from 'lucide-react'
import { PriceGrid } from './PriceGrid'
import { ProducerPriceTab } from './ProducerPriceTab'
import { usePriceCells } from './usePriceCells'

// ÜRÜN BAŞINA TEK FİYAT (2026-08-13). Ekran eskiden ürün × kalite matrisiydi;
// kalite özelliği kullanımdan kalktı ve mal kabul zaten kalite göndermiyordu —
// yani kaliteli fiyat satırları saha girişleriyle hiç eşleşmiyor, irsaliyede
// fiyat boş kalıyordu. Artık yazılan fiyat ürünün GENEL fiyatıdır.
//
// ÜÇ SEKME (2026-08-26): satış fiyatının yanına ALIŞ fiyatı geldi (üreticiye
// ödenen). Ayrı sayfa AÇILMADI çünkü aynı iş: aynı tarih seçici, aynı ürün
// araması, aynı carry-forward. Daha önemlisi MARJ ancak iki fiyat yan yanayken
// anlamlı — ayrı ekranda muhasebeci alışı, satışı görmeden girer.
const TABS = [
  { value: 'sale', label: 'Satış Fiyatları', icon: TrendingUp },
  { value: 'purchase', label: 'Alış Fiyatları', icon: ShoppingCart },
  { value: 'producer', label: 'Üretici Özel Fiyatı', icon: UserCog },
]

export function PricesPage() {
  const [date, setDate] = useState(today())
  const [tab, setTab] = useState('sale')
  const [products, setProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [query, setQuery] = useState('')
  const addToast = useToastStore((s) => s.addToast)
  // Backend'in gerekçeli hatasını göster (ör. "normal fiyat net'ten düşük
  // olamaz") — generic mesaj kullanıcıyı neyi yanlış yazdığı konusunda kör bırakır.
  const onError = (e) => addToast(e?.response?.data?.error ?? 'Fiyat kaydedilemedi', 'error')

  useEffect(() => {
    api.getAdminProducts().then(setProducts).finally(() => setLoadingProducts(false))
  }, [])

  // İki fiyat da HER SEKMEDE yükleniyor: marj kolonu ikisini birden gösteriyor.
  const sale = usePriceCells({
    fetcher: () => api.getPrices(date),
    saver: ({ productId, pricePerKg, listPricePerKg }) =>
      api.upsertPrice({ productId, pricePerKg, listPricePerKg, date }),
    deps: [date], onError,
  })
  const purchase = usePriceCells({
    fetcher: () => api.getPurchasePrices(date),
    saver: ({ productId, pricePerKg }) => api.upsertPurchasePrice({ productId, pricePerKg, date }),
    deps: [date], onError,
  })

  const active = tab === 'purchase' ? purchase : sale
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products
  }, [products, query])

  if (loadingProducts || sale.loading || purchase.loading) {
    return <div className="flex justify-center py-20"><LoadingSpinner size="lg" className="text-primary" /></div>
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text-primary">💰 Günlük Fiyatlar</h1>
        <input
          type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="mb-4">
        <Segmented value={tab} onChange={setTab} options={TABS} className="w-fit" />
      </div>

      {tab === 'producer' ? (
        <ProducerPriceTab date={date} products={products} />
      ) : (
        <>
          {active.lastUpdate && (
            <div className="mb-4 px-4 py-2.5 bg-primary-light rounded-xl text-sm text-primary-dark flex items-center gap-2 flex-wrap">
              <span className="font-semibold">Son güncelleme:</span>
              <span>{formatDate(active.lastUpdate.updatedAt)}</span>
              {active.lastUpdate.updatedBy && (
                <span>— <span className="font-semibold">{active.lastUpdate.updatedBy}</span> tarafından</span>
              )}
            </div>
          )}

          <p className="text-sm text-text-muted mb-4">
            {tab === 'purchase' ? (
              <>
                <strong className="text-text-secondary">Alış fiyatı</strong>, üreticiye ödenecek tutarı belirler:
                mal kabul kaydedildiği anda üreticinin cari hesabına borç olarak yazılır. Satış fiyatından
                tamamen bağımsızdır. <strong className="text-text-secondary">Fiyat girilmemiş ürünlerde borç
                yazılmaz</strong> — o kayıtlar Üretici Ödeme panelindeki "Fiyatsız Mal Kabul" listesinde birikir.
              </>
            ) : (
              <>
                <strong className="text-text-secondary">Net fiyat</strong>, bayiye kesilen irsaliyede kullanılan
                tutardır. İndirim yapacaksanız <strong className="text-text-secondary">Normal Fiyat</strong> alanına
                indirim öncesi rakamı yazın (ör. normal 70, net 50) — fişte "70 → 50" olarak görünür ve alt toplamda
                indirim tutarı yazar. Normal fiyat boşsa indirim yok sayılır, fişte tek rakam basılır.
                Hiç fiyat girilmemiş ürünler irsaliyede "—" olarak görünür.
              </>
            )}
            {' '}Fiyat alanını doldurup çıkınca otomatik kaydedilir; <strong className="text-text-secondary">girilen
            fiyat siz değiştirene kadar geçerlidir</strong> — her gün yeniden girmeniz gerekmez, devralınan fiyatlar
            kutunun altında tarihiyle belirtilir. Fiyat birimi ürünün satış birimine göre değişir (₺/kg · ₺/bağ · ₺/adet).
          </p>

          <div className="relative mb-4 max-w-md">
            <input
              value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ürün ara…"
              className="w-full px-4 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <PriceGrid
            mode={tab}
            products={visible}
            saleCells={sale.cells}
            purchaseCells={purchase.cells}
            saving={active.saving}
            onChange={active.change}
            onChangeList={active.changeList}
            onBlur={active.blur}
          />
        </>
      )}
    </div>
  )
}
