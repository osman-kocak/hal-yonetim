import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Segmented } from '@/components/ui/Segmented'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Pagination } from '@/components/ui/Pagination'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PrintedBadge } from '@/components/ui/ExitBadges'
import { formatTL } from '@/utils/currency'
import { formatDate, formatWeight } from '@/utils/formatters'
import { FileCheck, Clock, Search, X, Check, RotateCcw, AlertTriangle } from 'lucide-react'

// Ana sayfa kutusu kısa liste gösterir; tam sayfa daha uzun (bkz.
// InvoiceApprovalPage). Sayfa boyutu prop'tan geliyor ki iki kullanım
// aynı bileşeni paylaşsın — kopyalanan bir liste er ya da geç ayrışır.
const DEFAULT_PAGE_SIZE = 10

// Sekmeler tam olarak Exit.invoiceNo'nun boş/dolu olması. Ayrı bir "durum"
// alanı yok: iki kaynaklı gerçek er ya da geç ayrışır.
//
// ONAY BEKLEYENLER BAŞTA (varsayılan): widget'ın var oluş sebebi yapılacak iş,
// yapılmış iş değil.
const TABS = [
  { value: 'pending', label: 'Onay Bekleyenler', icon: Clock },
  { value: 'approved', label: 'Onaylılar', icon: FileCheck },
]

// Ana sayfadaki legal fatura onay kuyruğu.
//
// Muhasebeci elindeki faturayı sistemdeki irsaliyeyle eşleştirir; numara
// girildiği anda irsaliye "onaylı" olur ve tüm ekranlarda yanında fatura no
// rozeti çıkar.
export function InvoiceApprovalWidget({ pageSize = DEFAULT_PAGE_SIZE, className = 'mb-8' }) {
  const user = useAuthStore((s) => s.user)
  const addToast = useToastStore((s) => s.addToast)

  const [tab, setTab] = useState('pending')
  const [page, setPage] = useState(1)
  const [aramaMetni, setAramaMetni] = useState('')
  const [data, setData] = useState({ data: [], total: 0, pendingCount: 0 })
  const [loading, setLoading] = useState(true)
  // Hangi satırın onay alanı açık — aynı anda tek satır.
  const [acikId, setAcikId] = useState(null)
  const [faturaNo, setFaturaNo] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState('')
  const [geriAlinacak, setGeriAlinacak] = useState(null)

  // setState effect GÖVDESİNDE çağrılmıyor, zamanlayıcı geri çağrımında —
  // DepoHistoryTab ile aynı desen (react-hooks/set-state-in-effect).
  // Arama yazılırken 300 ms bekler, sekme/sayfa değişimi anında gider.
  const yukle = useCallback(() => {
    setLoading(true)
    const arama = aramaMetni.trim()
    api.getInvoiceQueue({ status: tab, page, limit: pageSize, q: arama || undefined })
      .then(setData)
      .catch((err) => addToast(errorMessage(err, 'Fatura kuyruğu yüklenemedi'), 'error'))
      .finally(() => setLoading(false))
  }, [tab, page, aramaMetni, pageSize, addToast])

  useEffect(() => {
    const t = setTimeout(yukle, aramaMetni ? 300 : 0)
    return () => clearTimeout(t)
  }, [yukle, aramaMetni])

  function ac(exit) {
    setAcikId(exit.id)
    // Düzeltmede mevcut numara alana gelir — muhasebeci sıfırdan yazmasın.
    setFaturaNo(exit.invoiceNo ?? '')
    setHata('')
  }

  function kapat() {
    setAcikId(null)
    setFaturaNo('')
    setHata('')
  }

  async function kaydet(exit) {
    const no = faturaNo.trim()
    if (!no) { setHata('Fatura numarası boş olamaz'); return }
    setKaydediliyor(true)
    setHata('')
    try {
      await api.setExitInvoiceNo(exit.id, no)
      addToast(`#${exit.id} faturalandı: ${no} ✓`)
      kapat()
      yukle()
    } catch (err) {
      // 409 = numara başka irsaliyede. Sunucunun mesajı hangi irsaliye olduğunu
      // söylüyor, toast'a değil ALANIN ALTINA yazılıyor: kullanıcı numarayı
      // düzeltirken mesajı görmeye devam etmeli.
      setHata(errorMessage(err, 'Kaydedilemedi'))
    } finally {
      setKaydediliyor(false)
    }
  }

  async function geriAl(exit) {
    try {
      await api.clearExitInvoiceNo(exit.id)
      addToast(`#${exit.id} onayı geri alındı`)
      setGeriAlinacak(null)
      yukle()
    } catch (err) {
      addToast(errorMessage(err, 'Geri alınamadı'), 'error')
      setGeriAlinacak(null)
    }
  }

  const bosMu = !loading && data.data.length === 0

  return (
    <div className={`bg-white border border-border rounded-2xl p-4 sm:p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
          <FileCheck className="w-5 h-5 text-primary" />
          Fatura Onayı
          {data.pendingCount > 0 && (
            <Badge variant="warning">{data.pendingCount} bekliyor</Badge>
          )}
        </h2>
        <div className="relative">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={aramaMetni}
            onChange={(e) => { setAramaMetni(e.target.value); setPage(1) }}
            placeholder="Fiş no, pazar, fatura no…"
            className="pl-9 pr-3 py-2 rounded-xl border border-border text-sm w-56 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <Segmented
        value={tab}
        onChange={(v) => { setTab(v); setPage(1); kapat() }}
        options={TABS}
        className="w-full sm:w-fit mb-4"
        size="sm"
      />

      {loading ? (
        <div className="py-10 flex justify-center"><LoadingSpinner /></div>
      ) : bosMu ? (
        <EmptyState
          icon={tab === 'pending' ? Check : FileCheck}
          title={tab === 'pending' ? 'Bekleyen fatura yok' : 'Onaylı irsaliye yok'}
          description={tab === 'pending'
            ? 'Kesilen tüm irsaliyeler faturayla eşleştirilmiş.'
            : 'Fatura numarası girilen irsaliyeler burada listelenir.'}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {data.data.map((ex) => (
            <div key={ex.id} className="border border-border rounded-xl p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">
                    #{ex.id} · {ex.market?.no} {ex.market?.name}
                    {ex.edited && <span className="ml-2 text-xs text-amber-600">(düzenlenmiş)</span>}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {formatDate(ex.createdAt)} · {ex.itemCount} kalem · {ex.trackedCases} kasa
                    {ex.totalWeight > 0 && ` · ${formatWeight(ex.totalWeight)}`}
                    {ex.totalBunches > 0 && ` · ${ex.totalBunches} bağ`}
                    {ex.totalPieces > 0 && ` · ${ex.totalPieces} adet`}
                  </p>
                  <p className="text-sm font-semibold text-primary mt-1 tabular-nums">
                    {formatTL(ex.amount)}
                    {/* Fiyatsız kalem tutara girmiyor — onaylayan kişi eksik
                        tutarı gerçek sanmasın. */}
                    {ex.missingPrices > 0 && (
                      <span className="ml-2 text-xs font-medium text-error inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {ex.missingPrices} kalemin fiyatı yok
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <PrintedBadge exit={ex} />
                  {tab === 'approved' && (
                    <Badge variant="success">
                      <FileCheck className="w-3 h-3 mr-1" />
                      {ex.invoiceNo}
                    </Badge>
                  )}
                  {acikId !== ex.id && (
                    <>
                      <Button size="sm" variant={tab === 'pending' ? 'primary' : 'outline'} onClick={() => ac(ex)}>
                        {tab === 'pending' ? 'Onayla' : 'Düzelt'}
                      </Button>
                      {/* Onayı geri alma YALNIZ ADMIN — muhasebeci numarayı
                          düzeltebilir ama bağı koparamaz. */}
                      {tab === 'approved' && user?.role === 'ADMIN' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setGeriAlinacak(ex)}
                          title="Onayı geri al"
                          className="flex items-center gap-1"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Onay alanı SATIRIN İÇİNDE açılıyor, modal değil: muhasebeci
                  elindeki faturayı sırayla giriyor ve her seferinde modal
                  açıp kapatmak akışı kesiyor. */}
              {acikId === ex.id && (
                <div className="mt-3 pt-3 border-t border-border flex flex-col gap-2">
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                      <label className="text-xs font-medium text-text-secondary">Legal Fatura No</label>
                      <input
                        autoFocus
                        value={faturaNo}
                        onChange={(e) => { setFaturaNo(e.target.value); setHata('') }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') kaydet(ex)
                          if (e.key === 'Escape') kapat()
                        }}
                        placeholder="örn. MSK2026000142"
                        className="px-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <Button size="sm" onClick={() => kaydet(ex)} loading={kaydediliyor} className="flex items-center gap-1">
                      <Check className="w-4 h-4" /> Kaydet
                    </Button>
                    <Button size="sm" variant="outline" onClick={kapat} disabled={kaydediliyor} className="flex items-center gap-1">
                      <X className="w-4 h-4" /> Vazgeç
                    </Button>
                  </div>
                  {hata && <p className="text-xs font-semibold text-error">{hata}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        total={data.total}
        pageSize={pageSize}
        hasMore={data.hasMore}
        onChange={(p) => { setPage(p); kapat() }}
      />

      <ConfirmDialog
        open={!!geriAlinacak}
        title="Onayı geri al"
        description={geriAlinacak
          ? `#${geriAlinacak.id} irsaliyesinin fatura eşleştirmesi (${geriAlinacak.invoiceNo}) kaldırılacak ve onay bekleyenlere dönecek. Devam edilsin mi?`
          : ''}
        confirmLabel="Geri Al"
        onConfirm={() => geriAl(geriAlinacak)}
        onClose={() => setGeriAlinacak(null)}
      />
    </div>
  )
}
