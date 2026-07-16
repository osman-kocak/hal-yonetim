import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { CrudPage } from './CrudPage'

export function RegionsPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const addToast = useToastStore((s) => s.addToast)

  const load = () => api.getAdminRegions().then(setRecords).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  async function onCreate(form) {
    await api.createRegion(form)
    addToast('Bölge eklendi ✓')
    load()
  }

  async function onUpdate(id, form) {
    await api.updateRegion(id, form)
    addToast('Bölge güncellendi ✓')
    load()
  }

  async function onDelete(id) {
    await api.deleteRegion(id)
    addToast('Bölge silindi')
    setRecords((p) => p.filter((r) => r.id !== id))
  }

  return (
    <CrudPage
      title="Bölgeler"
      singular="Bölge"
      icon="📍"
      records={records}
      loading={loading}
      fields={[{ name: 'name', label: 'Bölge Adı', placeholder: 'Güzelyurt' }]}
      columns={[{ label: 'Bölge Adı', render: (r) => r.name }]}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />
  )
}
