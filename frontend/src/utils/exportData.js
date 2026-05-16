// Generic data export: PDF (jsPDF + autotable) + XLSX (SheetJS)
// Dynamic import — bundle'a girmiyor, ilk kullanımda yüklenir.
//
// Kullanım:
//   await exportToPDF({ title, columns, rows, filename })
//   await exportToXLSX({ title, columns, rows, filename })

const PAGE_WIDTH = 210 // A4 mm
const MARGIN = 14

function safeName(filename, title) {
  return (filename || title || 'rapor').replace(/[^a-z0-9_-]+/gi, '_')
}

export async function exportToPDF({ title, subtitle, columns, rows, filename }) {
  // jsPDF + autotable + arialFont dynamic load — bundle ana chunk'a girmez
  const [{ default: jsPDF }, { default: autoTable }, { ARIAL_B64 }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('./arialFont'),
  ])

  const doc = new jsPDF()
  doc.addFileToVFS('Arial.ttf', ARIAL_B64)
  doc.addFont('Arial.ttf', 'Arial', 'normal')
  doc.addFileToVFS('Arial-Bold.ttf', ARIAL_B64)
  doc.addFont('Arial-Bold.ttf', 'Arial', 'bold')

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

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setFont('Arial', 'normal')
    doc.setTextColor(150)
    doc.text(`Sayfa ${i} / ${pageCount}  ·  Biapp Yazılım Hal Yönetim`, PAGE_WIDTH / 2, doc.internal.pageSize.height - 8, { align: 'center' })
  }

  doc.save(`${safeName(filename, title)}.pdf`)
}

export async function exportToXLSX({ title, columns, rows, filename }) {
  const XLSX = await import('xlsx')

  const data = [columns, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = columns.map((col, idx) => {
    const maxLen = Math.max(
      String(col).length,
      ...rows.map((r) => String(r[idx] ?? '').length),
    )
    return { wch: Math.min(Math.max(maxLen + 2, 10), 40) }
  })
  const wb = XLSX.utils.book_new()
  const sheetName = (title ?? 'Rapor').slice(0, 30).replace(/[\\/?*[\]:]/g, '_')
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${safeName(filename, title)}.xlsx`)
}
