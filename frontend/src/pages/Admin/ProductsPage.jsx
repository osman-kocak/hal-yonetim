import { useEffect, useState, useMemo } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { CrudPage } from './CrudPage'
import { getGroupIcon } from '@/utils/productGroups'
import { isCountable, unitLabel } from '@/utils/formatters'

// Liste/export'ta gösterilen tam birim adı — rozet kısa etiketi kullanır.
const UNIT_NAMES = { CASE: 'Kilo', BUNCH: 'Bağ', PIECE: 'Adet' }

export function ProductsPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const addToast = useToastStore((s) => s.addToast)

  const load = () => api.getAdminProducts().then(setRecords).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  // Mevcut ana ürün adları — datalist önerileri
  const groupOptions = useMemo(
    () => [...new Set(records.map((r) => (r.groupName ?? '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'tr')),
    [records],
  )

  // Boş "Ana ürün" → null (tekil ürün). Birim seçilmediyse kasa (varsayılan) —
  // select'te "Seçin…" bırakılırsa backend geçersiz enum diye 400 dönerdi.
  const clean = (form) => ({
    ...form,
    groupName: (form.groupName ?? '').trim() || null,
    unit: form.unit || 'CASE',
  })

  async function onCreate(form) {
    await api.createProduct(clean(form))
    addToast('Ürün eklendi ✓')
    load()
  }

  async function onUpdate(id, form) {
    await api.updateProduct(id, clean(form))
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
      singular="Ürün"
      icon="🌱"
      records={records}
      loading={loading}
      groupBy="groupName"
      groupIcon={getGroupIcon}
      fields={[
        { name: 'name', label: 'Ürün Adı', placeholder: 'Portakal Kan' },
        {
          name: 'groupName',
          label: 'Ana ürün (grup)',
          type: 'datalist',
          options: groupOptions,
          optional: true,
          placeholder: 'Portakal',
          help: 'Boş bırakırsan tekil ürün olur. Var olan bir ana ürünü seç ya da yeni ad yaz — aynı ana ürünlü ürünler giriş ekranında altında gruplanır.',
        },
        {
          name: 'unit',
          label: 'Satış birimi',
          type: 'select',
          optional: true,
          options: [
            { value: 'CASE', label: 'Kilo (kg ile satılır)' },
            { value: 'BUNCH', label: 'Bağ' },
            { value: 'PIECE', label: 'Adet' },
          ],
          help: 'Bağ/Adet seçilirse mal kabulde tartı sorulmaz, miktar doğrudan bağ/adet sayısı olarak girilir ve fiyat ₺/bağ ya da ₺/adet olur. Kasa üç birimde de sorulur ve kasa hesabına girer — hariç tutmak için mal kabulde siyah kasa işaretle. Boş bırakılırsa Kilo kabul edilir. Değiştirdiğinde geçmiş kayıtlar eski birimiyle kalır; depoda bekleyen girişler varsa önce onları sevk et.',
        },
        {
          name: 'icon',
          label: 'Emoji / İkon (opsiyonel)',
          placeholder: '🍊',
          optional: true,
          help: 'Telefondan emoji klavyesini veya kopyala-yapıştır kullan. Örn: 🍅 🍎 🥒 🌶️ 🧅',
        },
      ]}
      columns={[
        {
          label: 'Ürün',
          render: (r) => (
            <span className="flex items-center gap-2">
              <span className="text-xl">{r.icon || '📦'}</span>
              <span>{r.name}</span>
              {isCountable(r.unit) && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary-light text-primary-dark">
                  {unitLabel(r.unit).toUpperCase()}
                </span>
              )}
            </span>
          ),
          exportValue: (r) => r.name,
        },
        {
          label: 'Birim',
          render: (r) => UNIT_NAMES[r.unit] ?? UNIT_NAMES.CASE,
          exportValue: (r) => UNIT_NAMES[r.unit] ?? UNIT_NAMES.CASE,
        },
      ]}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />
  )
}
