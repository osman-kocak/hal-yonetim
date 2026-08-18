import { useCallback, useEffect, useState } from 'react'
import { api, asList, errorMessage } from '@/services/api'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { formatDate } from '@/utils/formatters'
import { ShieldAlert } from 'lucide-react'

// Yüksek kayıt sayısı = toplu veri çekme şüphesi. Bu eşiğin üstü kırmızı yanar.
const ANOMALY_THRESHOLD = 200

const RESOURCE_LABELS = {
  ledger: 'Cari hareketler', finance: 'Finans', producers: 'Üretici listesi',
  markets: 'Bayi listesi', users: 'Kullanıcı listesi', prices: 'Fiyatlar',
  returns: 'İadeler', history: 'Geçmiş', transfers: 'Transferler',
  'case-movements': 'Kasa hareketleri', reports: 'Raporlar', fire: 'Fire',
  // Yazma eylemlerinin kaynakları (2026-08-18)
  entry: 'Mal kabul', exit: 'İrsaliye', return: 'İade', transfer: 'Transfer',
  price: 'Fiyat', 'case-movement': 'Kasa hareketi', auth: 'Oturum', user: 'Kullanıcı',
}

// Eylem rozetleri. Silme kırmızı, düzenleme sarı, oluşturma yeşil — denetim
// ekranında gözün önce yıkıcı işlemlere takılması için.
const ACTION_LABELS = {
  READ: { label: 'Baktı', variant: 'success' },
  EXPORT: { label: 'İndirdi', variant: 'warning' },
  CREATE: { label: 'Oluşturdu', variant: 'success' },
  UPDATE: { label: 'Düzenledi', variant: 'warning' },
  DELETE: { label: 'Sildi', variant: 'error' },
  LOGIN: { label: 'Giriş', variant: 'default' },
  LOGIN_FAIL: { label: 'Başarısız giriş', variant: 'error' },
}

const PAGE_SIZE = 50

export function AuditPage() {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [action, setAction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = useCallback(() => {
    const params = { page, limit: PAGE_SIZE }
    if (action) params.action = action
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    return api.getAuditLogs(params)
      .then((res) => {
        setLogs(asList(res))
        setTotal(Array.isArray(res) ? res.length : (res?.total ?? 0))
        setHasMore(Array.isArray(res) ? false : (res?.hasMore ?? false))
        setError('')
      })
      .catch((err) => setError(errorMessage(err, 'Kayıtlar yüklenemedi')))
      .finally(() => setLoading(false))
  }, [action, dateFrom, dateTo, page])

  useEffect(() => {
    let alive = true
    const t = setTimeout(() => { if (alive) load() }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [load])

  useEffect(() => { setPage(1) }, [action, dateFrom, dateTo])

  const anomalies = logs.filter((l) => (l.recordCount ?? 0) >= ANOMALY_THRESHOLD).length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-primary" />
          Erişim Kayıtları
        </h1>
      </div>

      {anomalies > 0 && (
        <div className="bg-error/10 border border-error/30 rounded-xl p-3 mb-6 text-sm text-error">
          ⚠ {anomalies} kayıt yüksek miktarda veri çekmiş ({ANOMALY_THRESHOLD}+ satır) — toplu indirme olabilir, incele.
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {[
            { key: '', label: 'Hepsi' },
            { key: 'CREATE', label: 'Oluşturma' },
            { key: 'UPDATE', label: 'Düzenleme' },
            { key: 'DELETE', label: 'Silme' },
            { key: 'LOGIN_FAIL', label: 'Başarısız giriş' },
            { key: 'READ', label: 'Okuma' },
            { key: 'EXPORT', label: 'İndirme' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setAction(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${action === t.key ? 'bg-white text-text-primary shadow-card' : 'text-text-muted hover:text-text-primary'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Başlangıç</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border text-sm bg-white" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Bitiş</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border text-sm bg-white" />
        </div>
      </div>

      {error && <p className="text-sm text-error mb-4">{error}</p>}

      {loading ? (
        <LoadingSpinner />
      ) : !logs.length ? (
        <EmptyState title="Kayıt yok" description="Seçilen aralıkta erişim kaydı bulunmuyor." />
      ) : (
        <div className="bg-white border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-text-muted text-xs uppercase tracking-wide">
                <tr>
                  <th className="p-3 text-left">Tarih</th>
                  <th className="p-3 text-left">Kullanıcı</th>
                  <th className="p-3 text-left">İşlem</th>
                  <th className="p-3 text-left">Veri</th>
                  <th className="p-3 text-right">Kayıt</th>
                  <th className="p-3 text-left hidden md:table-cell">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((l) => {
                  const anomaly = (l.recordCount ?? 0) >= ANOMALY_THRESHOLD
                  return (
                    <tr key={l.id} className={anomaly ? 'bg-error/5' : 'hover:bg-gray-50'}>
                      <td className="p-3 whitespace-nowrap text-text-primary">{formatDate(l.createdAt)}</td>
                      <td className="p-3 font-medium text-text-primary">{l.username ?? `#${l.userId ?? '?'}`}</td>
                      <td className="p-3">
                        <Badge variant={ACTION_LABELS[l.action]?.variant ?? 'default'} className="text-[10px]">
                          {ACTION_LABELS[l.action]?.label ?? l.action}
                        </Badge>
                      </td>
                      <td className="p-3 text-text-secondary">
                        {RESOURCE_LABELS[l.resource] ?? l.resource}
                        {/* Ne yapıldığı: kayıt silinmiş olabileceği için özet
                            logun kendisinde duruyor, JOIN ile getirilemez. */}
                        {l.detail && (
                          <span className="block text-xs text-text-muted">{l.detail}</span>
                        )}
                      </td>
                      <td className={`p-3 text-right tabular-nums font-semibold ${anomaly ? 'text-error' : ''}`}>
                        {l.recordCount ?? '—'}
                      </td>
                      <td className="p-3 text-text-muted hidden md:table-cell">{l.ip ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        hasMore={hasMore}
        onChange={setPage}
      />
    </div>
  )
}
