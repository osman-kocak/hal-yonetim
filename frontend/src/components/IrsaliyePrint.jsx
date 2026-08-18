import { usePrintStore } from '@/store/printStore'
import { PAGE_ROWS } from '@/utils/pdfGenerator'
import { formatDate, isCountable, unitLabel } from '@/utils/formatters'

const fmt = (n) => new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(n))

// Bayi özeti alanları. Sunucu bunları göndermezse (önbellekteki eski bundle ya
// da eski bir payload) "—" basılır — 0 basmak "borcu yok" demek olurdu.
// pdfGenerator.js aynı biçimi üretir, ikisi lockstep.
//
// "TL" yazılıyor, "₺" DEĞİL: PDF'in gömülü Arial'inde ₺ simgesi yok ve jsPDF onu
// sessizce düşürüyor. Ekranda ₺ bırakılsa iki çıktı ayrışırdı.
const num = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('tr-TR').format(Number(n)))

// App seviyesinde tek örnek durur (bkz. App.jsx). Ekranda görünmez; yalnızca
// yazdırmada sayfayı kaplar — stiller index.css'teki @media print bloğunda.
// Yazdırmayı tetikleyen printIrsaliye() flushSync kullanıyor — bu bileşen
// tıklama anında senkron basılır, effect beklemeden.
export function IrsaliyePrintHost() {
  const irsaliye = usePrintStore((s) => s.irsaliye)
  if (!irsaliye) return null
  return <IrsaliyeSheet exit={irsaliye} />
}

export function IrsaliyeSheet({ exit }) {
  const isEdited = !!exit.editedAt

  const rows = (exit.items ?? []).map((item) => {
    const ppk = item.pricePerKg
    const hasPrice = ppk !== null && ppk !== undefined
    return {
      id: item.id,
      name: item.entry.product?.name ?? '—',
      caseCount: item.entry.caseCount,
      weight: item.entry.weight,
      // Kayıt anındaki birim snapshot'ı — ürünün birimi sonradan değişse de
      // basılmış fiş aynı kalmalı (bkz. Entry.unit).
      unit: item.entry.unit,
      price: hasPrice ? ppk : null,
    }
  })

  // PDF ile birebir aynı sayfalama (bkz. utils/pdfGenerator.js). Sayfa başına
  // sabit satır — tarayıcının doğal akışına bırakılırsa iki çıktı ayrışıyor.
  const pages = []
  for (let i = 0; i < rows.length; i += PAGE_ROWS) pages.push(rows.slice(i, i + PAGE_ROWS))
  if (!pages.length) pages.push([])

  return (
    <div className="print-root">
      {pages.map((pageRows, i) => (
        <section className="print-page" key={i}>
          <div className="print-body">
            <div className="print-head">
              <h1 className="print-title">
                {isEdited ? 'DÜZENLENMİŞ TESLİM FİŞİ' : 'TESLİM FİŞİ'}
              </h1>
              {pages.length > 1 && (
                <span className="print-pageno">Sayfa {i + 1}/{pages.length}</span>
              )}
            </div>
            {isEdited && (
              <p className="print-edited">
                Düzenleme: {formatDate(exit.editedAt)} — {exit.editedBy ?? 'Admin'}
              </p>
            )}

            {/* Bayi özeti başlıkta: fiş elden teslim edilirken "kaç kasam var,
                ne kadar borcum var" kâğıdın üstünde cevaplanmalı. Rakamlar
                BASIM ANINA aittir, fişin kesildiği ana değil (bkz. backend
                utils/marketSummary.js). pdfGenerator.js ile KİLİT ADIMLI. */}
            <div className="print-info">
              <div><strong>Fiş No:</strong> {exit.id}</div>
              <div><strong>Tarih:</strong> {formatDate(exit.createdAt)}</div>
              <div><strong>Pazar No:</strong> {exit.market?.no}</div>
              <div><strong>Pazar Adı:</strong> {exit.market?.name}</div>
              <div><strong>İrsaliye Kasa:</strong> {num(exit.trackedCases)}</div>
              {/* Bayinin ÜSTÜNDE duran bakiyeler kırmızı: ikisi de "geri
                  beklenen" tutar — kasa ve para. Bu fişin kendi kasa sayısı
                  (İrsaliye Kasa) siyah kalır, o bir borç değil teslimat. */}
              <div className="print-red">
                <strong>Toplam Kasa Bakiyesi:</strong> {num(exit.marketCaseBalance)}
              </div>
              {/* Toplam Borç KALDIRILDI (2026-08-18, saha isteği). Sunucu
                  marketDebt'i göndermeye devam ediyor — başka ekranlar
                  kullanıyor, yalnızca fişte basılmıyor. pdfGenerator.js ile
                  lockstep: ikisinden birinde kalırsa iki çıktı ayrışır. */}
            </div>

            <table className="print-table">
              <thead>
                {/* Tek fişte kilo, bağ ve adet kalemleri karışabildiği için
                    başlık birim taşımaz; hücre kendini tarif eder. Kasa sütunu
                    her satırda dolu — kasa sayımı birimden bağımsız.
                    pdfGenerator.js ile KİLİT ADIMLI — ikisi birlikte değişmeli. */}
                <tr>
                  <th className="tc">No</th>
                  <th className="tl">Ürün</th>
                  <th className="tr">Kasa</th>
                  <th className="tr">Miktar</th>
                  <th className="tr">Birim Fiyat (TL)</th>
                </tr>
              </thead>
              <tbody>
                {/* Sıra no HER SAYFADA 01'den başlar (saha isteği). Sayfa başına
                    PAGE_ROWS=21 satır olduğu için numara 21'i geçmez. */}
                {pageRows.map((r, idx) => (
                  <tr key={r.id}>
                    <td className="tc">{String(idx + 1).padStart(2, '0')}</td>
                    <td className="tl">{r.name}</td>
                    <td className="tr">{r.caseCount}</td>
                    <td className="tr">
                      {isCountable(r.unit) ? `${Number(r.weight)} ${unitLabel(r.unit)}` : `${fmt(r.weight)} kg`}
                    </td>
                    <td className="tr">{r.price !== null ? fmt(r.price) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {i === pages.length - 1 && (
            <div className="print-signatures">
              <div className="print-sig">
                <strong>Teslim Eden</strong>
                <div className="print-sig-line" />
                <span>Ad Soyad / İmza</span>
              </div>
              <div className="print-sig">
                <strong>Teslim Alan</strong>
                <div className="print-sig-line" />
                <span>Ad Soyad / İmza</span>
              </div>
            </div>
          )}

          <div className="print-banner">
            <strong>Bu teslim fişi Biapp Yazılım Hal Yönetim Sistemi ile oluşturulmuştur.</strong>
            <span>Yazılımı edinmek için iletişime geçin: osmankocak@bi-siparis.com</span>
            <span>Tel / WhatsApp: +90 533 846 12 60</span>
          </div>
        </section>
      ))}
    </div>
  )
}
