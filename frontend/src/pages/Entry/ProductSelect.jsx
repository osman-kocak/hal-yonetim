import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { api } from '@/services/api'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'
import { SelectCard } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { groupProducts, getProductIcon, variantLabel } from '@/utils/productGroups'

export function ProductSelect() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [openGroup, setOpenGroup] = useState(null) // açık ana ürün grubu
  const selectProduct = useAppStore((s) => s.selectProduct)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    api.getProducts()
      .then(setProducts)
      .catch(() => addToast('Ürünler yüklenemedi', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const groups = useMemo(() => groupProducts(products), [products])

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

  // --- Varyant seçimi (bir ana ürün açıkken) ---
  if (openGroup) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => setOpenGroup(null)}
            className="flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-primary transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Ana ürünler
          </button>
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <span>{openGroup.icon}</span>
            {openGroup.label}
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {openGroup.variants.map((p) => (
            <SelectCard
              key={p.id}
              label={variantLabel(p, openGroup.label)}
              icon={getProductIcon(p)}
              onClick={() => selectProduct(p)}
            />
          ))}
        </div>
      </div>
    )
  }

  // --- Ana ürün seçimi ---
  return (
    <div>
      <h2 className="text-xl font-bold text-text-primary mb-6">Ürün Seçin</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {groups.map((g) =>
          g.single ? (
            <SelectCard
              key={g.variants[0].id}
              label={g.label}
              icon={getProductIcon(g.variants[0])}
              onClick={() => selectProduct(g.variants[0])}
            />
          ) : (
            <SelectCard
              key={g.key}
              label={g.label}
              sublabel={`${g.variants.length} çeşit`}
              icon={g.icon}
              onClick={() => setOpenGroup(g)}
            />
          )
        )}
      </div>
    </div>
  )
}
