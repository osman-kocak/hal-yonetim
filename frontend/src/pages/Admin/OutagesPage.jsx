import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { Badge } from '@/components/ui/Badge'
import { formatDate, today } from '@/utils/formatters'
import { WifiOff, Clock, AlertTriangle, Tablet } from 'lucide-react'

// Saha kesinti ölçümü (Faz 0).
//
// NEDEN BU EKRAN: kesinti süreleri iPad'in localStorage'ında toplanıyordu ve
// okumak için cihazı Mac'e bağlayıp Safari konsolu açmak gerekiyordu — pratikte
// kimse okumadı. Offline mimarisine (Faz 2/3) yatırım kararı bu veriye dayanacak:
// kesinti günde 2 dakikaysa irsaliye offline'ı kendini karşılamaz, saatlerceyse
// şart.
//
// Cihaz kırılımı kritik: kesinti tek bir iPad'de mi (o cihazın wifi'si / konumu)
// yoksa hepsinde birden mi (hattın kendisi) — çözüm buna göre değişir.

const PAGE_SIZE = 50

// "2 dk 15 sn" — saniye cinsinden okumak sahada işe yaramıyor.
function sure(ms) {
  const sn = Math.round((ms ?? 0) / 1000)
  if (sn < 60) return `${sn} sn`
  const dk = Math.floor(sn / 60)
  const kalan = sn % 60
  if (dk < 60) return kalan ? `${dk} dk ${kalan} sn` : `${dk} dk`
  const saat = Math.floor(dk / 60)
  return `${saat} sa ${dk % 60} dk`
}

// Cihaz kimliği uuid — ekranda ilk 8 karakter yeter, tamamı tooltip'te.
const kisaCihaz = (id) => (id ? String(id).slice(0, 8) : '—')

function Ozet({ icon: Icon, label, value, hint, tone = 'primary' }) {
  return (
    <div className="bg-white border border-border rounded-2xl p-4 shadow-card">
      <div className="flex items-center gap-2 text-text-muted text-xs font-medium uppercase tracking-wide">
        <Icon className={`w-4 h-4 ${tone === 'error' ? 'text-error' : 'text-primary'}`} />
        {label}
      </div>
      <p className="text-2xl font-bold text-text-primary mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-text-muted mt-0.5">{hint}</p>}
    </div>
  )
}

export function OutagesPage() {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  // Varsayılan aralık: son 30 gün. Tek gün bakmak kesinti sıklığını göstermiyor.
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(today())

  // Veri çekme doğrudan effect içinde ve tüm setState'ler await'ten SONRA:
  // effect gövdesinde senkron setState zincirleme render tetikliyor
  // (react-hooks/set-state-in-effect). Yükleniyor durumunu etkileşimin kendisi
  // açıyor (filtre/sayfa değişimi), burası yalnızca kapatıyor.
  //
  // alive: filtre hızlı değişince eski isteğin geç gelen yanıtı yeni sonucu
  // ezmesin.
  useEffect(() => {
    let alive = true
    api.getOutages({ dateFrom, dateTo, page, limit: PAGE_SIZE })
      .then((res) => {
        if (!alive) return
        setRows(res?.data ?? [])
        setSummary(res?.summary ?? null)
        setTotal(res?.total ?? 0)
        setHasMore(!!res?.hasMore)
      })
      .catch(() => {
        if (!alive) return
        setRows([])
        setSummary(null)
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [dateFrom, dateTo, page])

  // Sayfa sıfırlama effect'te DEĞİL: filtre değişince zincirleme render tetikler
  // (react-hooks/set-state-in-effect). Değişimin kaynağında yapmak hem doğru
  // hem de tek adım.
  const filtreDegisti = (setter) => (e) => {
    setter(e.target.value)
    setPage(1)
    setLoading(true)
  }
  const sayfaDegisti = (p) => { setPage(p); setLoading(true) }

  const gunSayisi = Math.max(
    1,
    Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000) + 1
  )
  const gunlukOrt = summary ? summary.totalMs / gunSayisi : 0

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-text-primary mb-1">📡 Bağlantı Kesintileri</h1>
      <p className="text-sm text-text-muted mb-6">
        Saha cihazlarının ölçtüğü kesintiler. Offline yatırım kararı bu veriye dayanır.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Başlangıç</label>
          <input type="date" value={dateFrom} onChange={filtreDegisti(setDateFrom)}
            className="px-3 py-2 rounded-xl border border-border text-sm bg-white" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Bitiş</label>
          <input type="date" value={dateTo} onChange={filtreDegisti(setDateTo)}
            className="px-3 py-2 rounded-xl border border-border text-sm bg-white" />
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Ozet icon={WifiOff} label="Kesinti" value={summary.count} hint={`${gunSayisi} günde`} />
          <Ozet icon={Clock} label="Toplam süre" value={sure(summary.totalMs)}
            hint={`günlük ort. ${sure(gunlukOrt)}`} />
          <Ozet icon={AlertTriangle} label="En uzun" value={sure(summary.longestMs)} tone="error" />
          <Ozet icon={Tablet} label="Cihaz" value={summary.devices?.length ?? 0}
            hint="kesinti bildiren" />
        </div>
      )}

      {/* Cihaz kırılımı: tek cihazda toplanıyorsa sorun o iPad'in wifi'si ya da
          durduğu yer; hepsine yayılmışsa hattın kendisi. */}
      {summary?.devices?.length > 1 && (
        <div className="bg-white border border-border rounded-2xl p-4 shadow-card mb-6">
          <p className="text-sm font-semibold text-text-primary mb-2">Cihaz dağılımı</p>
          <div className="flex flex-wrap gap-2">
            {summary.devices.map((d) => (
              <Badge key={d.deviceId} variant="default" className="text-xs" title={d.deviceId}>
                {kisaCihaz(d.deviceId)} · {d.count} kesinti · {sure(d.totalMs)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><LoadingSpinner size="lg" className="text-primary" /></div>
      ) : !rows.length ? (
        <EmptyState
          icon="✅"
          title="Bu aralıkta kesinti kaydı yok"
          description="Cihazlar kesinti yaşadığında bağlantı gelir gelmez buraya bildirir. Kayıt yoksa ya kesinti olmamıştır ya da cihaz henüz bağlanmamıştır."
        />
      ) : (
        <div className="bg-white border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-text-muted text-xs uppercase tracking-wide">
                <tr>
                  <th className="p-3 text-left">Başlangıç</th>
                  <th className="p-3 text-left">Bitiş</th>
                  <th className="p-3 text-right">Süre</th>
                  <th className="p-3 text-left">Kullanıcı</th>
                  <th className="p-3 text-left hidden md:table-cell">Cihaz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className={r.ms >= 300000 ? 'bg-error/5' : 'hover:bg-gray-50'}>
                    <td className="p-3 whitespace-nowrap text-text-primary">{formatDate(r.startedAt)}</td>
                    <td className="p-3 whitespace-nowrap text-text-secondary">{formatDate(r.endedAt)}</td>
                    <td className={`p-3 text-right tabular-nums font-semibold ${r.ms >= 300000 ? 'text-error' : ''}`}>
                      {sure(r.ms)}
                    </td>
                    <td className="p-3 text-text-secondary">{r.username ?? '—'}</td>
                    <td className="p-3 text-text-muted hidden md:table-cell" title={r.deviceId}>
                      {kisaCihaz(r.deviceId)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} hasMore={hasMore} onChange={sayfaDegisti} />
    </div>
  )
}
