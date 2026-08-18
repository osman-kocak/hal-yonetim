// Generic data export: PDF (jsPDF + autotable) + XLSX (SheetJS)
// Dynamic import — bundle'a girmiyor, ilk kullanımda yüklenir.
//
// Kullanım:
//   await exportToPDF({ title, columns, rows, filename })
//   await exportToXLSX({ title, columns, rows, filename })
//   await exportToXLSXSheets({ sheets: [{name, columns, rows}], filename, title })

const PAGE_WIDTH = 210 // A4 mm
const MARGIN = 14

function safeName(filename, title) {
  return (filename || title || 'rapor').replace(/[^a-z0-9_-]+/gi, '_')
}

// Kolon genişlikleri. reduce ile: spread (...rows.map()) 20.000 satırda
// argüman limitine dayanıp "Maximum call stack size exceeded" veriyordu —
// irsaliye export'u ExitItem başına satır ürettiği için bu sınır gerçek.
function colWidths(columns, rows) {
  return columns.map((col, idx) => {
    const maxLen = rows.reduce(
      (m, r) => Math.max(m, String(r[idx] ?? '').length),
      String(col).length,
    )
    return { wch: Math.min(Math.max(maxLen + 2, 10), 40) }
  })
}

// Excel sekme adı kuralları:
//   • en fazla 31 karakter
//   • \ / ? * [ ] : yasak
//   • tek tırnakla başlayamaz/bitemez
//   • boş olamaz
//   • aynı kitapta iki sekme aynı adı taşıyamaz (büyük/küçük harf farkı sayılmaz)
const SHEET_NAME_MAX = 31

export function sanitizeSheetName(name, fallback = 'Sayfa') {
  let s = String(name ?? '')
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^'+|'+$/g, '')
    .trim()
  if (!s) s = fallback
  return s.slice(0, SHEET_NAME_MAX)
}

// Tekilleştirici. Dedupe KIRPMADAN SONRA yapılmalı: iki uzun adın ilk 31
// karakteri aynı olabilir. Sonek eklenirken taban tekrar kısaltılıyor.
export function makeSheetNamer() {
  const used = new Set()
  return function nameFor(name, fallback) {
    const base = sanitizeSheetName(name, fallback)
    let candidate = base
    for (let i = 2; used.has(candidate.toLocaleLowerCase('tr')); i++) {
      const suffix = ` (${i})`
      candidate = base.slice(0, SHEET_NAME_MAX - suffix.length).trimEnd() + suffix
    }
    used.add(candidate.toLocaleLowerCase('tr'))
    return candidate
  }
}

// Ara toplam satırlarını sarı zeminle işaretler. highlightRow(row) true dönen
// satırlar vurgulanır — çağıran hangi satırın toplam olduğunu bilir, bu dosya
// bilmez (bkz. HistoryPage → buildEntrySheets).
const HIGHLIGHT = {
  fill: { patternType: 'solid', fgColor: { rgb: 'FFF3C4' } },
  font: { bold: true },
}

function paintRows(XLSX, ws, rows, colCount, highlightRow) {
  if (typeof highlightRow !== 'function') return
  rows.forEach((row, i) => {
    if (!highlightRow(row)) return
    // +1: başlık satırı 0. sırada
    for (let c = 0; c < colCount; c++) {
      const addr = XLSX.utils.encode_cell({ r: i + 1, c })
      // Boş hücrede stil taşınmaz; zemin sürekli görünsün diye hücreyi oluştur
      if (!ws[addr]) ws[addr] = { t: 's', v: '' }
      ws[addr].s = HIGHLIGHT
    }
  })
}

export async function exportToPDF({ title, subtitle, columns, rows, filename, highlightRow }) {
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
    // Excel ile aynı satırlar sarı: iki çıktı aynı tabloyu anlatmalı
    didParseCell: (data) => {
      if (data.section !== 'body' || typeof highlightRow !== 'function') return
      if (!highlightRow(rows[data.row.index])) return
      data.cell.styles.fillColor = [255, 243, 196]
      data.cell.styles.fontStyle = 'bold'
    },
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

// NEDEN xlsx-js-style: SheetJS Community Edition hücre stillerini YAZARKEN
// düşürüyor (cell.s veriliyor, dosyada patternType:"none" kalıyor). Bu fork aynı
// API'yi sunuyor, tek fark stilin korunması. Dinamik import olduğu için ana
// bundle'a girmiyor.
export async function exportToXLSX({ title, columns, rows, filename, highlightRow }) {
  const XLSX = await import('xlsx-js-style')

  const data = [columns, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = colWidths(columns, rows)
  paintRows(XLSX, ws, rows, columns.length, highlightRow)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(title, 'Rapor'))
  XLSX.writeFile(wb, `${safeName(filename, title)}.xlsx`)
}

// Çok sekmeli XLSX: tek dosya, her grup (bölge / pazar) kendi sekmesinde.
// Analiz için: tek sekmede 20 pazarı elle filtrelemek yerine sekmeye tıklamak.
// exportToXLSX'e DOKUNULMADI — diğer 7 çağıran aynı yolda kalıyor.
export async function exportToXLSXSheets({ sheets, filename, title, highlightRow }) {
  const usable = (sheets ?? []).filter((s) => s?.rows?.length)
  if (!usable.length) return

  const XLSX = await import('xlsx-js-style')
  const wb = XLSX.utils.book_new()
  const nameFor = makeSheetNamer()

  usable.forEach((s, i) => {
    const columns = s.columns ?? []
    const ws = XLSX.utils.aoa_to_sheet([columns, ...s.rows])
    ws['!cols'] = colWidths(columns, s.rows)
    paintRows(XLSX, ws, s.rows, columns.length, highlightRow)
    // Başlık satırına filtre — sekme başına tek tık kazandırır.
    // ('!freeze' community build'de desteklenmiyor, eklemeyin.)
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: s.rows.length, c: Math.max(0, columns.length - 1) },
      }),
    }
    XLSX.utils.book_append_sheet(wb, ws, nameFor(s.name, `Sayfa ${i + 1}`))
  })

  XLSX.writeFile(wb, `${safeName(filename, title)}.xlsx`)
}
