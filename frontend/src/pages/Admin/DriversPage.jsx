import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { CrudPage } from './CrudPage'

export function DriversPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const addToast = useToastStore((s) => s.addToast)

  const load = () => api.getAdminDrivers().then(setRecords).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  async function onCreate(form) {
    await api.createDriver(form)
    addToast('Şoför eklendi ✓')
    load()
  }

  async function onUpdate(id, form) {
    await api.updateDriver(id, form)
    addToast('Şoför güncellendi ✓')
    load()
  }

  async function onDelete(id) {
    await api.deleteDriver(id)
    addToast('Şoför silindi')
    setRecords((p) => p.filter((r) => r.id !== id))
  }

  return (
    <CrudPage
      title="Şoförler"
      icon="🚚"
      records={records}
      loading={loading}
      fields={[{ name: 'name', label: 'Ad Soyad', placeholder: 'Ahmet Yılmaz' }]}
      columns={[{ label: 'Ad Soyad', render: (r) => r.name }]}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />
  )
}
