import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pencil, Trash2, Plus } from 'lucide-react'

// Generic CRUD page — used by Drivers, Products, Qualities, Markets
export function CrudPage({
  title,
  icon,
  records,
  loading,
  fields,     // [{ name, label, type?, placeholder? }]
  columns,    // [{ label, render }]
  onCreate,
  onUpdate,
  onDelete,
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  function openCreate() {
    setEditing(null)
    setForm({})
    setErrors({})
    setModalOpen(true)
  }

  function openEdit(record) {
    setEditing(record)
    setForm(Object.fromEntries(fields.map((f) => [f.name, record[f.name] ?? ''])))
    setErrors({})
    setModalOpen(true)
  }

  function validate() {
    const e = {}
    fields.forEach((f) => {
      if (f.optional) return
      if (f.requiredOnCreate && editing) return
      if (!form[f.name] && form[f.name] !== 0) e[f.name] = 'Bu alan zorunludur'
    })
    return e
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      if (editing) await onUpdate(editing.id, form)
      else await onCreate(form)
      setModalOpen(false)
    } catch (err) {
      setErrors({ _: err.response?.data?.error ?? 'Kayıt başarısız' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await onDelete(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <span>{icon}</span> {title}
        </h1>
        <Button size="md" onClick={openCreate} className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> Ekle
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" className="text-primary" /></div>
      ) : !records.length ? (
        <EmptyState icon={icon} title={`Henüz ${title.toLowerCase()} eklenmemiş`} />
      ) : (
        <div className="bg-white border border-border rounded-2xl shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-border">
              <tr>
                {columns.map((c) => (
                  <th key={c.label} className="p-4 text-left font-semibold text-text-secondary">{c.label}</th>
                ))}
                <th className="p-4 text-right font-semibold text-text-secondary">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                  {columns.map((c) => (
                    <td key={c.label} className="p-4 text-text-primary">{c.render(record)}</td>
                  ))}
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEdit(record)}
                        className="p-2 rounded-lg hover:bg-primary-light text-primary transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(record)}
                        className="p-2 rounded-lg hover:bg-red-50 text-error transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Düzenle` : `Yeni ${title.slice(0, -1)}`}
      >
        <div className="flex flex-col gap-4">
          {fields.map((f) => {
            if (f.type === 'select') {
              return (
                <div key={f.name} className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-text-secondary">{f.label}</label>
                  <select
                    value={form[f.name] ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, [f.name]: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-white text-text-primary text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                    <option value="">Seçin…</option>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  {f.help && <p className="text-xs text-text-muted">{f.help}</p>}
                  {errors[f.name] && <p className="text-xs text-error">{errors[f.name]}</p>}
                </div>
              )
            }
            return (
              <div key={f.name} className="flex flex-col gap-1">
                <Input
                  label={f.label}
                  type={f.type ?? 'text'}
                  inputMode={f.inputMode}
                  placeholder={f.placeholder}
                  value={form[f.name] ?? ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.name]: e.target.value }))}
                  error={errors[f.name]}
                />
                {f.help && <p className="text-xs text-text-muted">{f.help}</p>}
              </div>
            )
          })}
          {errors._ && <p className="text-sm text-error">{errors._}</p>}
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>İptal</Button>
            <Button onClick={handleSave} loading={saving}>Kaydet</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Kaydı Sil"
        description="Bu işlem geri alınamaz. Devam etmek istiyor musunuz?"
      />
    </div>
  )
}
