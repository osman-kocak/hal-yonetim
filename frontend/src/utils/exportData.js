// Generic data export: PDF (jsPDF + autotable) + XLSX (SheetJS)
// Kullanım:
//   exportToPDF({ title, columns, rows, filename })
//   exportToXLSX({ title, columns, rows, filename })
//
// columns: ['Tarih', 'Tip', 'Tutar']
// rows: [['16.05.2026', 'Tahsilat', '1.500,00 TL'], ...]
// filename: 'finans-rapor-2026-05-16'

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { ARIAL_B64 } from './arialFont'

const PAGE_WIDTH = 210 // A4 mm
const MARGIN = 14

// Arial font yükle ki Türkçe karakterler (İ, ç, ş, ğ vs.) düzgün gözüksün
function initFont(doc) {
  doc.addFileToVFS('Arial.ttf', ARIAL_B64)
  doc.addFont('Arial.ttf', 'Arial', 'normal')
  doc.addFileToVFS('Arial-Bold.ttf', ARIAL_B64)
  doc.addFont('Arial-Bold.ttf', 'Arial', 'bold')
}

export function exportToPDF({ title, subtitle, columns, rows, filename }) {
  const doc = new jsPDF()
  initFont(doc)

  // Başlık
  doc.setFontSize(14)
  doc.setFont('Arial', 'bold')
  doc.text(title ?? 'Rapor', MARGIN, 18)

  if (subtitle) {
    doc.setFontSize(10)
    doc.setFont('Arial', 'normal')
    doc.setTextColor(120)
    doc.text(subtitle, MARGIN, 25)
    doc.setTextColor(0)
  }

  // Tarih
  doc.setFontSize(9)
  doc.setFont('Arial', 'normal')
  doc.setTextColor(120)
  doc.text(`Çıktı: ${new Date().toLocaleString('tr-TR')}`, PAGE_WIDTH - MARGIN, 18, { align: 'right' })
  doc.setTextColor(0)

  autoTable(doc, {
    head: [columns],
    body: rows,
    startY: subtitle ? 32 : 28,
    headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold', font: 'Arial' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 8, cellPadding: 2, font: 'Arial' },
    margin: { left: MARGIN, right: MARGIN },
  })

  // Alt banner — MS Yazılım
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setFont('Arial', 'normal')
    doc.setTextColor(150)
    doc.text(`Sayfa ${i} / ${pageCount}  ·  MS Yazılım Hal Yönetim`, PAGE_WIDTH / 2, doc.internal.pageSize.height - 8, { align: 'center' })
  }

  const safeName = (filename || title || 'rapor').replace(/[^a-z0-9_-]+/gi, '_')
  doc.save(`${safeName}.pdf`)
}

export function exportToXLSX({ title, columns, rows, filename }) {
  const data = [columns, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(data)

  // Sütun genişlikleri (otomatik tahmin)
  const colWidths = columns.map((col, idx) => {
    const maxLen = Math.max(
      String(col).length,
      ...rows.map((r) => String(r[idx] ?? '').length),
    )
    return { wch: Math.min(Math.max(maxLen + 2, 10), 40) }
  })
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  const sheetName = (title ?? 'Rapor').slice(0, 30).replace(/[\\/?*[\]:]/g, '_')
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  const safeName = (filename || title || 'rapor').replace(/[^a-z0-9_-]+/gi, '_')
  XLSX.writeFile(wb, `${safeName}.xlsx`)
}
