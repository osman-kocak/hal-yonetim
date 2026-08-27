import { FileCheck } from 'lucide-react'
import { InvoiceApprovalWidget } from './InvoiceApprovalWidget'

// Fatura onayının TAM SAYFA hâli — sol menüden ve giriş ekranındaki kutucuktan
// açılır.
//
// Ana sayfadaki kutu ile AYNI bileşeni kullanıyor, kopya değil: iki liste
// kopyalansaydı biri güncellenip diğeri unutulur ve aynı irsaliye iki ekranda
// farklı görünürdü. Fark yalnızca sayfa başına kayıt: burada iş yapılıyor,
// dashboard'da yalnız durum görülüyor.
export function InvoiceApprovalPage() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <FileCheck className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold text-text-primary">Fatura Onayı</h1>
      </div>
      <InvoiceApprovalWidget pageSize={25} className="" />
    </div>
  )
}
