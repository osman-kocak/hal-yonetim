import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'
import { SelectCard } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export function QualitySelect() {
  const [qualities, setQualities] = useState([])
  const [loading, setLoading] = useState(true)
  const { selectQuality, selectedProduct } = useAppStore()
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    api.getQualities()
      .then(setQualities)
      .catch(() => addToast('Kaliteler yüklenemedi', 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    )
  }

  return (
    <div>
      <p className="text-text-muted text-sm mb-2">Seçilen Ürün</p>
      <h2 className="text-xl font-bold text-text-primary mb-6">{selectedProduct?.name} — Kalite Seçin</h2>
      <div className="grid grid-cols-2 gap-6 max-w-md">
        {qualities.map((q) => (
          <SelectCard
            key={q.id}
            label={`${q.name} Kalite`}
            icon={q.name === 'A' ? '⭐' : '✅'}
            colorClass={q.name === 'A' ? 'hover:border-quality-a/40' : 'hover:border-quality-b/40'}
            onClick={() => selectQuality(q)}
          />
        ))}
      </div>
    </div>
  )
}
