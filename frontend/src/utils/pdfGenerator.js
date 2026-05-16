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

  const head = [['Ürün', 'Kalite', 'Kasa', 'Ağırlık (kg)', 'Tutar (₺/kg)', 'Toplam (₺)']]

  const body = exit.items.map((item) => [
    item.entry.product.name,
    item.entry.quality.name,
    item.entry.caseCount,
    Number(item.entry.weight).toFixed(2),
    item.pricePerKg !== null && item.pricePerKg !== undefined
      ? Number(item.pricePerKg).toFixed(2)
      : '',
    '', // Toplam — el ile doldurulacak
  ])

  const foot = [['GENEL TOPLAM', '', '', '', '', '']]

  const colStyles = {
    0: { cellWidth: 45 },
    1: { cellWidth: 20, halign: 'center' },
    2: { cellWidth: 18, halign: 'right' },
    3: { cellWidth: 28, halign: 'right' },
    4: { cellWidth: 30, halign: 'right' },
    5: { cellWidth: 35, halign: 'right' },
  }

  autoTable(doc, {
    startY: isEdited ? 66 : 65,
    head,
    body,
    foot,
    headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold', font: 'Arial' },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', font: 'Arial' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { font: 'Arial', fontSize: 9 },
    columnStyles: colStyles,
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
  const bannerY = pageH - 18
  doc.setFillColor(22, 163, 74)
  doc.rect(0, bannerY - 4, pageW, 22, 'F')
  doc.setFont('Arial', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text('Bu irsaliye MS Yazılım Hal Yönetim Sistemi ile oluşturulmuştur.', pageW / 2, bannerY + 3, { align: 'center' })
  doc.setFont('Arial', 'normal')
  doc.setFontSize(8)
  doc.text('Yazılımı edinmek için iletişime geçin: bisiparisadm@gmail.com', pageW / 2, bannerY + 10, { align: 'center' })
  doc.setTextColor(0, 0, 0)

  // Yeni sekmede aç (print için hazır)
  window.open(doc.output('bloburl'), '_blank')
}
