import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'
import { SelectCard } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'

const PRODUCT_ICONS = {
  domates: '🍅', biber: '🫑', salatalık: '🥒', patlıcan: '🍆',
  soğan: '🧅', patates: '🥔', havuç: '🥕', maydanoz: '🌿',
  marul: '🥬', ıspanak: '🥬', elma: '🍎', armut: '🍐',
  portakal: '🍊', mandalina: '🍊', üzüm: '🍇',
}

function getIcon(product) {
  // Önce DB'de saklı emoji, sonra isim-bazlı fallback, en son default
  if (product?.icon) return product.icon
  return PRODUCT_ICONS[product?.name?.toLowerCase()] ?? '🌱'
}

export function ProductSelect() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const selectProduct = useAppStore((s) => s.selectProduct)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    api.getProducts()
      .then(setProducts)
      .catch(() => addToast('Ürünler yüklenemedi', 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    )
  }

  if (!products.length) {
    return <EmptyState icon="📦" title="Henüz ürün eklenmemiş" description="Admin panelinden ürün ekleyin" />
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-text-primary mb-6">Ürün Seçin</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map((p) => (
          <SelectCard
            key={p.id}
            label={p.name}
            icon={getIcon(p)}
            onClick={() => selectProduct(p)}
          />
        ))}
      </div>
    </div>
  )
}
