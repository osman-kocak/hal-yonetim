import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { CrudPage } from './CrudPage'

export function MarketsPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const addToast = useToastStore((s) => s.addToast)

  const load = () => api.getAdminMarkets().then(setRecords).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  async function onCreate(form) {
    await api.createMarket({ ...form, no: Number(form.no) })
    addToast('Pazar eklendi ✓')
    load()
  }

  async function onUpdate(id, form) {
    await api.updateMarket(id, { ...form, no: Number(form.no) })
    addToast('Pazar güncellendi ✓')
    load()
  }

  async function onDelete(id) {
    await api.deleteMarket(id)
    addToast('Pazar silindi')
    setRecords((p) => p.filter((r) => r.id !== id))
  }

  return (
    <CrudPage
      title="Pazarlar"
      icon="🏪"
      records={records}
      loading={loading}
      fields={[
        { name: 'no', label: 'Pazar No', type: 'number', inputMode: 'numeric', placeholder: '1' },
        { name: 'name', label: 'Pazar Adı', placeholder: 'Pazar 1' },
      ]}
      columns={[
        { label: 'No', render: (r) => <span className="font-bold text-primary">#{r.no}</span> },
        { label: 'Ad', render: (r) => r.name },
      ]}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />
  )
}
