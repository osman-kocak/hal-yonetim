import { Badge } from '@/components/ui/Badge'
import { FileCheck, Printer, Clock } from 'lucide-react'
import { formatDate } from '@/utils/formatters'

// İrsaliye durum rozetleri — TEK YERDE.
//
// Aynı iki rozet dört ekranda birden görünüyor (dashboard onay widget'ı,
// Takip & Geçmiş listesi, çıkış ekranındaki başarı kartı ve fiş üstündeki
// bilgi). Kopyalansaydı biri güncellenip diğerleri unutulur, aynı irsaliye iki
// ekranda farklı durumda görünürdü.

// Legal fatura eşleştirmesi. invoiceNo dolu = onaylı.
export function InvoiceBadge({ exit, className }) {
  if (exit?.invoiceNo) {
    return (
      <Badge
        variant="success"
        className={className}
        title={`${formatDate(exit.invoiceAt)}${exit.invoiceBy ? ` · ${exit.invoiceBy}` : ''}`}
      >
        <FileCheck className="w-3 h-3 mr-1" />
        Fatura {exit.invoiceNo}
      </Badge>
    )
  }
  return (
    <Badge variant="warning" className={className} title="Legal fatura numarası henüz girilmedi">
      <Clock className="w-3 h-3 mr-1" />
      Fatura bekliyor
    </Badge>
  )
}

// Baskı durumu.
//
// BASILMADI DEMİYORUZ, rozet yalnızca basılmışsa çıkıyor. Sebep: bu bilgi
// %100 güvenilir değil (AirPrint paneli iptal edilirse tarayıcı haber vermiyor)
// ve bu özellikten ÖNCEKİ irsaliyelerin hepsi basılmış olmasına rağmen
// printedAt'leri boş. "Basılmadı" basmak o kayıtlara yanlış etiket yapıştırırdı.
export function PrintedBadge({ exit, className }) {
  if (!exit?.printedAt) return null
  const kez = exit.printCount > 1 ? ` ×${exit.printCount}` : ''
  return (
    <Badge
      variant="primary"
      className={className}
      title={`${formatDate(exit.printedAt)}${exit.printedBy ? ` · ${exit.printedBy}` : ''}`}
    >
      <Printer className="w-3 h-3 mr-1" />
      İrsaliye basıldı{kez}
    </Badge>
  )
}

// İkisi bir arada — çağrı yerlerinin çoğu ikisini yan yana istiyor.
export function ExitBadges({ exit, className = '' }) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <InvoiceBadge exit={exit} />
      <PrintedBadge exit={exit} />
    </span>
  )
}
