import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ARIAL_B64 } from './arialFont'
import { formatDate } from './formatters'

function initFont(doc) {
  doc.addFileToVFS('Arial.ttf', ARIAL_B64)
  doc.addFont('Arial.ttf', 'Arial', 'normal')
  doc.addFileToVFS('Arial-Bold.ttf', ARIAL_B64)
  doc.addFont('Arial-Bold.ttf', 'Arial', 'bold')
}

export function generateIrsaliye(exit) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  initFont(doc)

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  const isEdited = !!exit.editedAt

  // Başlık
  doc.setFont('Arial', 'bold')
  doc.setFontSize(18)
  doc.text(isEdited ? 'DÜZENLENMİŞ SATIŞ İRSALİYESİ' : 'SATIŞ İRSALİYESİ', pageW / 2, 20, { align: 'center' })

  if (isEdited) {
    doc.setFont('Arial', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(180, 0, 0)
    doc.text(`Düzenleme: ${formatDate(exit.editedAt)} — ${exit.editedBy ?? 'Admin'}`, pageW / 2, 27, { align: 'center' })
    doc.setTextColor(0, 0, 0)
  }

  const infoY = isEdited ? 36 : 35

  // Bilgi bloğu
  doc.setFont('Arial', 'normal')
  doc.setFontSize(10)
  doc.text(`İrsaliye No: ${exit.id}`, 15, infoY)
  doc.text(`Tarih: ${formatDate(exit.createdAt)}`, 15, infoY + 7)
  doc.text(`Pazar No: ${exit.market.no}`, 15, infoY + 14)
  doc.text(`Pazar Adı: ${exit.market.name}`, 15, infoY + 21)

  doc.setLineWidth(0.5)
  doc.line(15, infoY + 25, pageW - 15, infoY + 25)

  const head = [['Ürün', 'Kasa', 'Ağırlık (kg)', 'Tutar (TL/kg)', 'Toplam (TL)']]

  const fmt = (n) => new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n))

  let grandTotal = 0
  const body = exit.items.map((item) => {
    const ppk = item.pricePerKg
    const hasPrice = ppk !== null && ppk !== undefined
    const lineTotal = hasPrice ? Number(ppk) * Number(item.entry.weight) : null
    if (lineTotal !== null) grandTotal += lineTotal
    return [
      item.entry.product?.name ?? '—',
      item.entry.caseCount,
      fmt(item.entry.weight),
      hasPrice ? fmt(ppk) : '—',
      lineTotal !== null ? fmt(lineTotal) : '—',
    ]
  })

  const foot = [['GENEL TOPLAM', '', '', '', fmt(grandTotal)]]

  const colStyles = {
    0: { cellWidth: 55, halign: 'left' },
    1: { cellWidth: 20, halign: 'right' },
    2: { cellWidth: 30, halign: 'right' },
    3: { cellWidth: 30, halign: 'right' },
    4: { cellWidth: 35, halign: 'right' },
  }

  autoTable(doc, {
    startY: isEdited ? 66 : 65,
    head,
    body,
    foot,
    headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold', font: 'Arial' },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', font: 'Arial' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { font: 'Arial', fontSize: 9, cellPadding: 2 },
    columnStyles: colStyles,
    didParseCell: (data) => {
      // Başlık ve değerleri aynı kenarda hizala (sayısal kolonlar sağa, ürün sola)
      if (data.section === 'head') {
        data.cell.styles.halign = data.column.index === 0 ? 'left' : 'right'
      }
    },
  })

  // İmza satırları
  const sigY = doc.lastAutoTable.finalY + 25
  doc.setFont('Arial', 'bold')
  doc.setFontSize(10)
  doc.text('Teslim Eden', 30, sigY)
  doc.text('Teslim Alan', 130, sigY)
  doc.setLineWidth(0.3)
  doc.line(15, sigY + 18, 85, sigY + 18)
  doc.line(115, sigY + 18, pageW - 15, sigY + 18)
  doc.setFont('Arial', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  doc.text('Ad Soyad / İmza', 50, sigY + 24, { align: 'center' })
  doc.text('Ad Soyad / İmza', 152, sigY + 24, { align: 'center' })
  doc.setTextColor(0, 0, 0)

  // Alt Banner
  const bannerY = pageH - 24
  doc.setFillColor(22, 163, 74)
  doc.rect(0, bannerY - 4, pageW, 28, 'F')
  doc.setFont('Arial', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text('Bu irsaliye MS Yazılım Hal Yönetim Sistemi ile oluşturulmuştur.', pageW / 2, bannerY + 3, { align: 'center' })
  doc.setFont('Arial', 'normal')
  doc.setFontSize(8)
  doc.text('Yazılımı edinmek için iletişime geçin: bisiparisadm@gmail.com', pageW / 2, bannerY + 10, { align: 'center' })
  doc.text('Tel / WhatsApp: +90 533 846 12 60', pageW / 2, bannerY + 16, { align: 'center' })
  doc.setTextColor(0, 0, 0)

  // Yeni sekmede aç (print için hazır)
  window.open(doc.output('bloburl'), '_blank')
}
