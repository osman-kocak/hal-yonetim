import { formatDate, isCountable, unitLabel } from './formatters'

// Sayfa başına sabit satır sayısı. HTML yazdırma (components/IrsaliyePrint.jsx)
// aynı değeri kullanır — iki çıktı birebir aynı sayfalansın diye.
export const PAGE_ROWS = 21

// jsPDF + autotable + Arial font dynamic load — bundle ana chunk'a girmesin.
async function loadPdfStack() {
  const [{ default: jsPDF }, { default: autoTable }, { ARIAL_B64 }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('./arialFont'),
  ])
  return { jsPDF, autoTable, ARIAL_B64 }
}

function initFont(doc, ARIAL_B64) {
  doc.addFileToVFS('Arial.ttf', ARIAL_B64)
  doc.addFont('Arial.ttf', 'Arial', 'normal')
  doc.addFileToVFS('Arial-Bold.ttf', ARIAL_B64)
  doc.addFont('Arial-Bold.ttf', 'Arial', 'bold')
}

const fmt = (n) => new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(n))

// Miktar hücresi kendi birimini taşır: "340,00 kg" · "30 bağ" · "8 adet".
// formatQty yerine burada kuruluyor çünkü PDF binlik ayracı tr-TR olmalı.
// IrsaliyePrint.jsx aynı biçimi üretir — ikisi lockstep.
const qtyCell = (entry) => (isCountable(entry.unit)
  ? `${Number(entry.weight)} ${unitLabel(entry.unit)}`
  : `${fmt(entry.weight)} kg`)

// Bayi özeti alanları — IrsaliyePrint.jsx'teki ikizleriyle lockstep.
// Sunucu göndermezse "—": 0 basmak "borcu yok" demek olurdu.
const num = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('tr-TR').format(Number(n)))
const money = (n) => (n === null || n === undefined ? '—' : `${fmt(n)} ₺`)

// targetWin: çağıran, tıklama anında senkron açılmış boş bir sekme verebilir.
// iOS Safari `await`ten sonraki window.open()'ı popup sayıp engelliyor; hazır
// sekmeye yazmak bu engeli aşar (bkz. printStore.printIrsaliye).
export async function generateIrsaliye(exit, targetWin = null) {
  const { jsPDF, autoTable, ARIAL_B64 } = await loadPdfStack()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  initFont(doc, ARIAL_B64)

  // Arkalı önlü basmayı kapatma ipucu. AirPrint bunu genelde yok sayar —
  // asıl ayar iOS yazdırma panelindeki "Çift Taraflı" anahtarı.
  if (typeof doc.viewerPreferences === 'function') {
    doc.viewerPreferences({ Duplex: 'Simplex' })
  }

  const pageW = doc.internal.pageSize.getWidth()   // 210
  const pageH = doc.internal.pageSize.getHeight()  // 297

  // Kenar payı yok; SIDE yalnızca yazıcıların fiziksel olarak basamadığı
  // ~5mm'lik şeride metin denk gelmesin diye. Yeşil footer tam genişlikte.
  const SIDE = 6
  const FOOTER_H = 22
  const footerTop = pageH - FOOTER_H

  const isEdited = !!exit.editedAt
  // Header her sayfada tekrar eder; yüksekliği düzenleme notuna göre değişir.
  // Bayi özeti (kasa + borç) iki satır daha ekledi: 29→41.
  // Sığma kontrolü: tablo 41'de başlar, 21 satır × 8mm + başlık ≈ 176mm →
  // 217mm'de biter, imzalar 243mm'de başlar. PAGE_ROWS değişmedi.
  const headerH = isEdited ? 46 : 41

  function drawHeader(pageNo, pageCount) {
    doc.setTextColor(0, 0, 0)
    doc.setFont('Arial', 'bold')
    doc.setFontSize(18)
    doc.text(isEdited ? 'DÜZENLENMİŞ TESLİM FİŞİ' : 'TESLİM FİŞİ', pageW / 2, 9, { align: 'center' })

    if (pageCount > 1) {
      doc.setFont('Arial', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(120, 120, 120)
      doc.text(`Sayfa ${pageNo}/${pageCount}`, pageW - SIDE, 9, { align: 'right' })
      doc.setTextColor(0, 0, 0)
    }

    let y = 14
    if (isEdited) {
      doc.setFont('Arial', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(180, 0, 0)
      doc.text(`Düzenleme: ${formatDate(exit.editedAt)} — ${exit.editedBy ?? 'Admin'}`, pageW / 2, y, { align: 'center' })
      doc.setTextColor(0, 0, 0)
      y += 5
    }

    const infoY = y + 4
    doc.setFont('Arial', 'normal')
    doc.setFontSize(10)
    doc.text(`Fiş No: ${exit.id}`, SIDE, infoY)
    doc.text(`Tarih: ${formatDate(exit.createdAt)}`, pageW / 2, infoY)
    doc.text(`Pazar No: ${exit.market?.no ?? '—'}`, SIDE, infoY + 6)
    doc.text(`Pazar Adı: ${exit.market?.name ?? '—'}`, pageW / 2, infoY + 6)

    // Bayi özeti — IrsaliyePrint.jsx ile aynı alanlar ve aynı sıra.
    doc.text(`İrsaliye Kasa: ${num(exit.trackedCases)}`, SIDE, infoY + 12)
    doc.text(`Toplam Kasa Bakiyesi: ${num(exit.marketCaseBalance)}`, pageW / 2, infoY + 12)

    // Borç kırmızı ve tek başına satırda — rakam gözden kaçmasın.
    doc.setTextColor(180, 0, 0)
    doc.text(`Toplam Borç: ${money(exit.marketDebt)}`, SIDE, infoY + 18)
    doc.setTextColor(0, 0, 0)

    doc.setLineWidth(0.4)
    doc.line(SIDE, infoY + 22, pageW - SIDE, infoY + 22)
  }

  function drawFooter() {
    doc.setFillColor(22, 163, 74)
    // Footer artık gövde ve imzalarla aynı SIDE payında biter (2026-08-15).
    // Eskiden kenardan kenara tam genişlikti ve fişin sağ/sol kenarı üç farklı
    // yerde bitiyordu. index.css → .print-banner ile lockstep.
    doc.rect(SIDE, footerTop, pageW - SIDE * 2, FOOTER_H, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('Arial', 'bold')
    doc.setFontSize(9)
    doc.text('Bu teslim fişi Biapp Yazılım Hal Yönetim Sistemi ile oluşturulmuştur.', pageW / 2, footerTop + 7, { align: 'center' })
    doc.setFont('Arial', 'normal')
    doc.setFontSize(8)
    doc.text('Yazılımı edinmek için iletişime geçin: osmankocak@bi-siparis.com', pageW / 2, footerTop + 13, { align: 'center' })
    doc.text('Tel / WhatsApp: +90 533 846 12 60', pageW / 2, footerTop + 18, { align: 'center' })
    doc.setTextColor(0, 0, 0)
  }

  // İmza yalnızca son sayfada, footer'ın hemen üstünde — sabit konumda, böylece
  // son sayfa 2 satır da içerse 21 satır da içerse aynı yerde durur.
  function drawSignatures() {
    const y = footerTop - 32
    // İmza blokları da SIDE payında: iki eşit sütun, aralarında 20mm boşluk —
    // index.css → .print-signatures (flex, gap 20mm) ile aynı geometri.
    const gap = 20
    const colW = (pageW - SIDE * 2 - gap) / 2
    const leftMid = SIDE + colW / 2
    const rightMid = SIDE + colW + gap + colW / 2

    doc.setFont('Arial', 'bold')
    doc.setFontSize(10)
    doc.text('Teslim Eden', leftMid, y, { align: 'center' })
    doc.text('Teslim Alan', rightMid, y, { align: 'center' })
    doc.setLineWidth(0.3)
    doc.line(SIDE, y + 18, SIDE + colW, y + 18)
    doc.line(SIDE + colW + gap, y + 18, pageW - SIDE, y + 18)
    doc.setFont('Arial', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text('Ad Soyad / İmza', leftMid, y + 24, { align: 'center' })
    doc.text('Ad Soyad / İmza', rightMid, y + 24, { align: 'center' })
    doc.setTextColor(0, 0, 0)
  }

  // Tek irsaliyede kilo, bağ ve adet kalemleri KARIŞABİLİR (20 kasa domates +
  // 30 bağ marul + 8 adet lahana). Global başlık bu yüzden birim taşıyamaz —
  // hücre kendini tarif eder: "340,00 kg" / "30 bağ" / "8 adet". Kasa sütunu
  // artık her satırda dolu: kasa sayımı birimden bağımsız.
  // DİKKAT: IrsaliyePrint.jsx ile KİLİT ADIMLI değişir, ayrışırsa ekran çıktısı
  // ile PDF farklı basar.
  const head = [['Ürün', 'Kasa', 'Miktar', 'Birim Fiyat (TL)']]

  const body = (exit.items ?? []).map((item) => {
    const ppk = item.pricePerKg
    const hasPrice = ppk !== null && ppk !== undefined
    return [
      item.entry.product?.name ?? '—',
      item.entry.caseCount,
      qtyCell(item.entry),
      hasPrice ? fmt(ppk) : '—',
    ]
  })

  // Sayfa başına tam PAGE_ROWS satır: autoTable'ın kendi akışına bırakmak yerine
  // elle böl, her sayfayı kendimiz çizelim (header/footer sabit kalsın diye).
  const chunks = []
  for (let i = 0; i < body.length; i += PAGE_ROWS) chunks.push(body.slice(i, i + PAGE_ROWS))
  if (!chunks.length) chunks.push([])

  // Miktar hücresi artık birim ekiyle ("340,00 kg" / "30 bağ") geldiği için
  // 2. kolon biraz genişledi; ürün adı kalan alanı alır.
  const usable = pageW - SIDE * 2
  const columnStyles = {
    0: { cellWidth: usable - 116, halign: 'left', overflow: 'ellipsize' },
    1: { cellWidth: 28, halign: 'right' },
    2: { cellWidth: 48, halign: 'right' },
    3: { cellWidth: 40, halign: 'right' },
  }

  chunks.forEach((chunk, i) => {
    if (i > 0) doc.addPage()
    drawHeader(i + 1, chunks.length)

    autoTable(doc, {
      startY: headerH,
      head,
      body: chunk,
      margin: { left: SIDE, right: SIDE, top: headerH, bottom: FOOTER_H },
      headStyles: {
        fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold',
        font: 'Arial', minCellHeight: 8, valign: 'middle',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      // Sabit satır yüksekliği: uzun ürün adı satırı büyütüp sayfayı taşırmasın.
      styles: {
        font: 'Arial', fontSize: 9, cellPadding: 2,
        minCellHeight: 8, valign: 'middle', overflow: 'ellipsize',
      },
      columnStyles,
      didParseCell: (data) => {
        // Başlık ve değerleri aynı kenarda hizala (sayısal kolonlar sağa, ürün sola)
        if (data.section === 'head') {
          data.cell.styles.halign = data.column.index === 0 ? 'left' : 'right'
        }
      },
    })

    if (i === chunks.length - 1) drawSignatures()
    drawFooter()
  })

  // Yeni sekmede aç (print için hazır)
  const url = doc.output('bloburl')
  if (targetWin && !targetWin.closed) targetWin.location.href = url
  else window.open(url, '_blank')
}
