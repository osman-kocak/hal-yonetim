import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { CrudPage } from './CrudPage'
import { Badge } from '@/components/ui/Badge'

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin (tüm yetkiler)' },
  { value: 'ACCOUNTING', label: 'Muhasebe (admin paneli)' },
  { value: 'DEPO', label: 'Depo Personeli' },
  { value: 'OPERATOR', label: 'Operatör (mal kabul / çıkış)' },
  { value: 'CASE_MANAGER', label: 'Kasacı Müdür' },
]

const ROLE_BADGE = {
  ADMIN: { variant: 'error', label: 'Admin' },
  ACCOUNTING: { variant: 'warning', label: 'Muhasebe' },
  DEPO: { variant: 'primary', label: 'Depo' },
  OPERATOR: { variant: 'default', label: 'Operatör' },
  CASE_MANAGER: { variant: 'default', label: 'Kasacı' },
}

export function UsersPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const addToast = useToastStore((s) => s.addToast)

  const load = () => api.getAdminUsers().then(setRecords).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  function cleanForm(form) {
    const data = { ...form }
    if (!data.password) delete data.password // boş şifre = değiştirme
    if (!data.username) delete data.username
    data.active = data.active === undefined ? true : !!data.active
    return data
  }

  async function onCreate(form) {
    await api.createUser(cleanForm(form))
    addToast('Kullanıcı eklendi ✓')
    load()
  }

  async function onUpdate(id, form) {
    await api.updateUser(id, cleanForm(form))
    addToast('Kullanıcı güncellendi ✓')
    load()
  }

  async function onDelete(id) {
    await api.deleteUser(id)
    addToast('Kullanıcı silindi')
    setRecords((p) => p.filter((r) => r.id !== id))
  }

  return (
    <CrudPage
      title="Kullanıcılar"
      icon="👤"
      records={records}
      loading={loading}
      fields={[
        { name: 'name', label: 'Ad Soyad', placeholder: 'Mehmet Kaya' },
        {
          name: 'roles',
          label: 'Roller (birden fazla seçilebilir)',
          type: 'multi-checkbox',
          options: ROLE_OPTIONS,
          help: 'Tüm roller için kullanıcı adı + şifre gerekli (giriş yapabilmek için)',
        },
        {
          name: 'username',
          label: 'Kullanıcı Adı',
          placeholder: 'kullanici1',
          optional: true,
          help: 'Sisteme giriş yapacak kullanıcılar için',
        },
        {
          name: 'password',
          label: 'Şifre',
          type: 'password',
          placeholder: '••••••••',
          optional: true,
          requiredOnCreate: false,
          help: 'Düzenlemede boş bırakılırsa değişmez',
        },
      ]}
      columns={[
        { label: 'Ad Soyad', render: (r) => r.name },
        {
          label: 'Kullanıcı Adı',
          render: (r) => r.username ? <span className="font-mono text-sm">{r.username}</span> : <span className="text-text-muted text-xs">—</span>,
        },
        {
          label: 'Roller',
          render: (r) => {
            const roles = Array.isArray(r.roles) ? r.roles : (r.role ? [r.role] : [])
            return (
              <div className="flex flex-wrap gap-1">
                {roles.map((rl) => {
                  const meta = ROLE_BADGE[rl] ?? { variant: 'default', label: rl }
                  return <Badge key={rl} variant={meta.variant}>{meta.label}</Badge>
                })}
              </div>
            )
          },
        },
        {
          label: 'Durum',
          render: (r) => r.active
            ? <Badge variant="success">Aktif</Badge>
            : <Badge variant="default">Pasif</Badge>,
        },
      ]}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />
  )
}
