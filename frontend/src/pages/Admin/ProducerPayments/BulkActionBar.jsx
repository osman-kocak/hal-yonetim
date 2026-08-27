import { Button } from '@/components/ui/Button'
import { formatTL } from '@/utils/currency'

// Seçim varken ekranın altına sabitlenen çubuk. Sticky olmasının sebebi:
// 200 satırlık tabloda seçim yapıp aşağı kaydırınca aksiyon butonu ekranın
// dışında kalıyordu.
//
// left-56 = AdminLayout sidebar genişliği (w-56); çubuk sidebar'ın üstüne
// binmesin. Mobilde sidebar yok, o yüzden lg altında left-0.
export function BulkActionBar({ count, total, onClear, onPay }) {
  if (!count) return null
  return (
    <div className="fixed bottom-0 left-0 lg:left-56 right-0 z-40 bg-white border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.06)] px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
      <span className="text-sm text-text-secondary">
        <strong className="text-text-primary">{count}</strong> üretici seçildi
        {' · '}Toplam bakiye <strong className="text-text-primary tabular-nums">{formatTL(total)}</strong>
      </span>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onClear}>Seçimi Temizle</Button>
        <Button onClick={onPay}>Toplu Ödeme</Button>
      </div>
    </div>
  )
}
