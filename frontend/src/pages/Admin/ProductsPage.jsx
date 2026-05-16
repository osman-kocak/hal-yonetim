import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { CrudPage } from './CrudPage'

export function ProductsPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const addToast = useToastStore((s) => s.addToast)

  const load = () => api.getAdminProducts().then(setRecords).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  async function onCreate(form) {
    await api.createProduct(form)
    addToast('Ürün eklendi ✓')
    load()
  }

  async function onUpdate(id, form) {
    await api.updateProduct(id, form)
    addToast('Ürün güncellendi ✓')
    load()
  }

  async function onDelete(id) {
    await api.deleteProduct(id)
    addToast('Ürün silindi')
    setRecords((p) => p.filter((r) => r.id !== id))
  }

  return (
    <CrudPage
      title="Ürünler"
      icon="🌱"
      records={records}
      loading={loading}
      fields={[{ name: 'name', label: 'Ürün Adı', placeholder: 'Domates' }]}
      columns={[{ label: 'Ürün Adı', render: (r) => r.name }]}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />
  )
}
