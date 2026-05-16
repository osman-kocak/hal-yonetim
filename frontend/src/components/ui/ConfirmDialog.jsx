import { Modal } from './Modal'
import { Button } from './Button'

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Sil', loading }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-text-secondary text-sm mb-6">{description}</p>
      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={onClose} disabled={loading}>İptal</Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}
