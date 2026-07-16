import { useEffect, useMemo, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { CrudPage } from './CrudPage'
import { Badge } from '@/components/ui/Badge'

export function ProducersPage() {
  const [records, setRecords] = useState([])
  const [regions, setRegions] = useState([])
  const [loading, setLoading] = useState(true)
  const addToast = useToastStore((s) => s.addToast)

  const load = () => api.getAdminProducers().then(setRecords).finally(() => setLoading(false))

  useEffect(() => {
    load()
    api.getAdminRegions().then(setRegions).catch(() => {})
  }, [])

  const regionOptions = useMemo(
    () => regions.map((r) => ({ value: String(r.id), label: r.name })),
    [regions]
  )

  const regionMap = useMemo(() => {
    const m = new Map()
    regions.forEach((r) => m.set(r.id, r.name))
    return m
  }, [regions])

  function cleanForm(form) {
    return {
      ...form,
      regionId: form.regionId ? Number(form.regionId) : null,
      allRegions: !!form.allRegions,
    }
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

  async function toggleActive(record) {
    const next = !record.active
    try {
      await api.updateProducer(record.id, { active: next })
      setRecords((p) => p.map((r) => r.id === record.id ? { ...r, active: next } : r))
      addToast(next ? 'Üretici aktif edildi ✓' : 'Üretici pasif edildi')
    } catch {
      addToast('Durum değiştirilemedi', 'error')
    }
  }

  return (
    <CrudPage
      title="Üreticiler"
      singular="Üretici"
      icon="👤"
      records={records}
      loading={loading}
      fields={[
        { name: 'name', label: 'Ad Soyad', placeholder: 'Mehmet Üretici' },
        {
          name: 'regionId',
          label: 'Bölge',
          type: 'select',
          options: regionOptions,
          optional: true,
          help: 'Bu üretici sadece seçilen bölgenin Mal Kabul listesinde görünür. Boş = hiçbir bölgeye atanmamış',
        },
        {
          name: 'allRegions',
          label: 'Tüm bölgelerde görünsün',
          type: 'checkbox',
          optional: true,
          help: 'İşaretliyse bölge seçiminden bağımsız olarak her bölgenin üretici listesinde çıkar',
        },
      ]}
      columns={[
        { label: 'Ad Soyad', render: (r) => r.name },
        {
          label: 'Bölge',
          render: (r) => r.allRegions
            ? <Badge variant="warning">Tüm bölgeler</Badge>
            : r.regionId
              ? <Badge variant="primary">{regionMap.get(r.regionId) ?? `#${r.regionId}`}</Badge>
              : <span className="text-text-muted text-xs">Atanmamış</span>,
          exportValue: (r) => r.allRegions
            ? 'Tüm bölgeler'
            : (r.regionId ? (regionMap.get(r.regionId) ?? `#${r.regionId}`) : 'Atanmamış'),
        },
        {
          label: 'Durum',
          render: (r) => (
            <button
              type="button"
              onClick={() => toggleActive(r)}
              className="focus:outline-none"
              title="Aktif/Pasif değiştir"
            >
              {r.active === false
                ? <Badge variant="default">Pasif</Badge>
                : <Badge variant="success">Aktif</Badge>}
            </button>
          ),
          exportValue: (r) => (r.active === false ? 'Pasif' : 'Aktif'),
        },
      ]}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />
  )
}
