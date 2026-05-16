import { useEffect, useMemo, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { CrudPage } from './CrudPage'
import { Badge } from '@/components/ui/Badge'

export function ProducersPage() {
  const [records, setRecords] = useState([])
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const addToast = useToastStore((s) => s.addToast)

  const load = () => api.getAdminProducers().then(setRecords).finally(() => setLoading(false))

  useEffect(() => {
    load()
    api.getAdminDrivers().then(setDrivers).catch(() => {})
  }, [])

  const driverOptions = useMemo(
    () => drivers.map((d) => ({ value: String(d.id), label: d.name })),
    [drivers]
  )

  const driverMap = useMemo(() => {
    const m = new Map()
    drivers.forEach((d) => m.set(d.id, d.name))
    return m
  }, [drivers])

  function cleanForm(form) {
    const data = { ...form, driverId: form.driverId ? Number(form.driverId) : null }
    return data
  }

  async function onCreate(form) {
    await api.createProducer(cleanForm(form))
    addToast('Üretici eklendi ✓')
    load()
  }

  async function onUpdate(id, form) {
    await api.updateProducer(id, cleanForm(form))
    addToast('Üretici güncellendi ✓')
    load()
  }

  async function onDelete(id) {
    await api.deleteProducer(id)
    addToast('Üretici silindi')
    setRecords((p) => p.filter((r) => r.id !== id))
  }

  return (
    <CrudPage
      title="Üreticiler"
      icon="👤"
      records={records}
      loading={loading}
      fields={[
        { name: 'name', label: 'Ad Soyad', placeholder: 'Mehmet Üretici' },
        {
          name: 'driverId',
          label: 'Atanmış Şoför',
          type: 'select',
          options: driverOptions,
          optional: true,
          help: 'Bu üretici sadece seçilen şoförün Mal Kabul ekranında görünür. Boş = hiçbir şoföre atanmamış',
        },
      ]}
      columns={[
        { label: 'Ad Soyad', render: (r) => r.name },
        {
          label: 'Şoför',
          render: (r) => r.driverId
            ? <Badge variant="primary">{driverMap.get(r.driverId) ?? `#${r.driverId}`}</Badge>
            : <span className="text-text-muted text-xs">Atanmamış</span>,
        },
      ]}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />
  )
}
