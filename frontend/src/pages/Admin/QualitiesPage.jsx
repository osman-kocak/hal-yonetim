import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { CrudPage } from './CrudPage'
import { Badge } from '@/components/ui/Badge'

export function QualitiesPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const addToast = useToastStore((s) => s.addToast)

  const load = () => api.getQualities_admin().then(setRecords).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  async function onCreate(form) {
    await api.createQuality(form)
    addToast('Kalite eklendi ✓')
    load()
  }

  async function onUpdate(id, form) {
    await api.updateQuality(id, form)
    addToast('Kalite güncellendi ✓')
    load()
  }

  async function onDelete(id) {
    await api.deleteQuality(id)
    addToast('Kalite silindi')
    setRecords((p) => p.filter((r) => r.id !== id))
  }

  return (
    <CrudPage
      title="Kaliteler"
      icon="⭐"
      records={records}
      loading={loading}
      fields={[{ name: 'name', label: 'Kalite Adı', placeholder: 'A' }]}
      columns={[{
        label: 'Kalite',
        render: (r) => (
          <Badge variant={r.name === 'A' ? 'quality-a' : 'quality-b'}>{r.name}</Badge>
        )
      }]}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />
  )
}
