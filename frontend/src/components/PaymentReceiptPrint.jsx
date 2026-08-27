import { usePrintStore } from '@/store/printStore'
import { formatTLPlain } from '@/utils/currency'
import { METHOD_LABEL } from '@/pages/Admin/ProducerPayments/constants'

// ÜRETİCİ ÖDEME MAKBUZU — A4'e İKİ NÜSHA (üretici + işletme), ortada kesik çizgi.
//
// Neden gerekli: üreticiye çoğu zaman elden nakit veriliyor. İmzalı bir belge
// olmadan "aldım/almadım" tartışmasının tarafı yok. Muhasebenin de kasa
// mutabakatı için fiziksel dayanağı bu.
//
// Para birimi "TL" olarak yazılıyor, ₺ DEĞİL: jsPDF'in gömülü Arial'inde ₺
// simgesi yok ve sessizce düşüyor (bkz. IrsaliyePrint.jsx). Ekran ile kâğıt
// ayrışmasın diye yazdırılan her tutar formatTLPlain'den geçiyor.
//
// balanceBefore/After BACKEND'den geliyor — modal açıldığı andaki bakiye kayıt
// anındakinden farklı olabilir (başka kullanıcı aynı anda ödeme girmiş olabilir).
// Geçmiş ödemelerin makbuzunda bu alanlar boş kalır; tarih ve tutar yeterli.
function Nusha({ r, etiket }) {
  const tarih = new Date(r.occurredAt)
  return (
    <div className="print-receipt-half">
      <div className="print-receipt-head">
        <div>
          <div className="print-receipt-title">ÜRETİCİ ÖDEME MAKBUZU</div>
          <div className="print-receipt-sub">{etiket}</div>
        </div>
        <div className="print-receipt-no">
          <div>No: {r.receiptNo ?? '—'}</div>
          <div>{tarih.toLocaleDateString('tr-TR')}</div>
        </div>
      </div>

      <div className="print-info">
        <div><strong>Üretici:</strong> {r.producerName ?? '—'}</div>
        {r.regionName && <div><strong>Bölge:</strong> {r.regionName}</div>}
        <div><strong>Ödeme Şekli:</strong> {METHOD_LABEL[r.method] ?? '—'}
          {r.reference ? ` (${r.reference})` : ''}</div>
      </div>

      <table className="print-table">
        <tbody>
          {r.balanceBefore != null && (
            <tr>
              <td className="tl">Ödeme öncesi bakiye</td>
              <td className="tr">{formatTLPlain(r.balanceBefore)}</td>
            </tr>
          )}
          <tr>
            <td className="tl"><strong>Ödenen tutar</strong></td>
            <td className="tr"><strong>{formatTLPlain(r.amount)}</strong></td>
          </tr>
          {r.balanceAfter != null && (
            <tr>
              <td className="tl">Kalan bakiye</td>
              <td className="tr">{formatTLPlain(r.balanceAfter)}</td>
            </tr>
          )}
        </tbody>
      </table>

      {r.note && <div className="print-receipt-note">Açıklama: {r.note}</div>}

      <div className="print-signatures">
        <div className="print-sig">
          <div className="print-sig-line" />
          <div>Teslim Eden{r.createdBy ? ` — ${r.createdBy}` : ''}</div>
        </div>
        <div className="print-sig">
          <div className="print-sig-line" />
          <div>Teslim Alan (Üretici)</div>
        </div>
      </div>
    </div>
  )
}

export function PaymentReceiptPrintHost() {
  const receipt = usePrintStore((s) => s.receipt)
  if (!receipt) return null
  return (
    <div className="print-root">
      <div className="print-page">
        <Nusha r={receipt} etiket="ÜRETİCİ NÜSHASI" />
        <div className="print-cut" />
        <Nusha r={receipt} etiket="İŞLETME NÜSHASI" />
      </div>
    </div>
  )
}
