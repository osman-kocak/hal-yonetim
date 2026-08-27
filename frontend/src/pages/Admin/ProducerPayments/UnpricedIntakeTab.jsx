import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { hasAnyRole } from '@/utils/roles'
import { useToastStore } from '@/store/toastStore'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { formatDate, formatQty } from '@/utils/formatters'
import { formatTL } from '@/utils/currency'
import { CheckCircle2, ChevronDown, ChevronRight, Calculator, UserPlus } from 'lucide-react'

const SEBEP = {
  NO_GENERAL_PRICE: 'Bu ürüne hiç alış fiyatı girilmemiş',
  NO_PRICE_ON_DATE: 'O tarihte geçerli alış fiyatı yoktu (fiyat sonradan girilmiş)',
}

// Borcu yazılamamış mal kabuller.
//
// Bu sekme olmadan toplam borç SESSİZCE eksik kalır ve kimse fark etmez.
// İki kova ayrı çünkü iki farklı düzeltme gerekiyor: fiyat gir vs üretici ata.
export function UnpricedIntakeTab({ dateFrom, dateTo, onChanged }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(new Set())
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dryRun, setDryRun] = useState(null)
  const [producers, setProducers] = useState([])
  const [atama, setAtama] = useState({})
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)
  const user = useAuthStore((s) => s.user)
  // Toplu yeniden hesaplama para yazıyor ve geri alması elle temizlik
  // gerektiriyor — ADMIN'e kısıtlı.
  const isAdmin = hasAnyRole(user, 'ADMIN')

  const load = () => {
    setLoading(true)
    api.getUnpricedIntakes({ dateFrom, dateTo }).then(setData).finally(() => setLoading(false))
  }
  useEffect(load, [dateFrom, dateTo])
  useEffect(() => { api.getAdminProducers().then((l) => setProducers(l.filter((p) => p.active))).catch(() => {}) }, [])

  async function uretaciAta(entryId) {
    const producerId = Number(atama[entryId])
    if (!producerId) return
    setBusy(true)
    try {
      const r = await api.assignEntryProducer(entryId, producerId)
      addToast(r.debtWritten ? 'Üretici atandı, borç yazıldı ✓' : 'Üretici atandı — alış fiyatı yok, borç yazılmadı')
      load(); onChanged?.()
    } catch (e) {
      addToast(e?.response?.data?.error ?? 'Üretici atanamadı', 'error')
    } finally { setBusy(false) }
  }

  async function onizle() {
    setBusy(true)
    try {
      const r = await api.recalcProducerDebts({ dateFrom, dateTo, dryRun: true })
      setDryRun(r)
      setConfirm(true)
    } catch (e) {
      addToast(e?.response?.data?.error ?? 'Hesaplama yapılamadı', 'error')
    } finally { setBusy(false) }
  }

  async function uygula() {
    setBusy(true)
    try {
      const r = await api.recalcProducerDebts({ dateFrom, dateTo })
      addToast(r.written > 0
        ? `${r.written} mal kabul için ${formatTL(r.totalAmount)} borç oluşturuldu ✓`
        : 'Borcu yazılabilecek kayıt bulunamadı')
      setConfirm(false); setDryRun(null); load(); onChanged?.()
    } catch (e) {
      addToast(e?.response?.data?.error ?? 'Borç oluşturulamadı', 'error')
    } finally { setBusy(false) }
  }

  if (loading && !data) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" className="text-primary" /></div>
  const bos = !data?.noPrice.count && !data?.noProducer.count
  if (bos) {
    return <EmptyState icon={CheckCircle2} title="Her mal kabulün borcu yazılmış"
      description="Alış fiyatı girilmemiş veya üreticisi seçilmemiş mal kabul kaydı yok." />
  }

  return (
    <div className="flex flex-col gap-6">
      {data.noPrice.count > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-bold text-text-primary">Alış fiyatı girilmemiş</h2>
              <p className="text-sm text-text-muted">
                <strong className="text-error">{data.noPrice.count} mal kabul</strong> kaydının borcu
                {' '}<strong className="text-error">yazılmadı</strong> — {data.noPrice.productCount} üründe fiyat eksik.
                Toplam borç bu kadar eksik görünüyor.
              </p>
            </div>
            {isAdmin && (
              <Button variant="success" onClick={onizle} loading={busy}>
                <Calculator className="w-4 h-4" /> Fiyatları Uygula ve Yeniden Hesapla
              </Button>
            )}
          </div>

          <div className="bg-white border border-border rounded-2xl shadow-card overflow-hidden">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="p-2 sm:p-3 w-8"></th>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Ürün</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">Kayıt</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">Üretici</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">Toplam Miktar</th>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Tarih Aralığı</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.noPrice.groups.map((g) => {
                  const acik = expanded.has(g.productId)
                  return [
                    <tr key={g.productId} className="hover:bg-gray-50">
                      <td className="p-2 sm:p-3">
                        <button type="button" onClick={() => setExpanded((s) => {
                          const n = new Set(s); n.has(g.productId) ? n.delete(g.productId) : n.add(g.productId); return n
                        })} className="p-1 rounded hover:bg-gray-100 text-text-muted">
                          {acik ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="p-2 sm:p-3">
                        <div className="flex items-center gap-1.5">
                          <span>{g.icon || '📦'}</span>
                          <span className="font-medium text-text-primary">{g.productName}</span>
                        </div>
                        <Badge variant={g.reason === 'NO_GENERAL_PRICE' ? 'error' : 'warning'} className="mt-0.5">
                          {SEBEP[g.reason] ?? g.reason}
                        </Badge>
                      </td>
                      <td className="p-2 sm:p-3 text-right tabular-nums font-semibold">{g.entryCount}</td>
                      <td className="p-2 sm:p-3 text-right tabular-nums text-text-muted">{g.producerCount}</td>
                      <td className="p-2 sm:p-3 text-right tabular-nums">{formatQty(g.totalQuantity, g.unit)}</td>
                      <td className="p-2 sm:p-3 text-text-secondary whitespace-nowrap">
                        {formatDate(g.firstDate).slice(0, 10)} — {formatDate(g.lastDate).slice(0, 10)}
                      </td>
                      <td className="p-2 sm:p-3 text-right">
                        {/* Fiyat ekranına DERİN LİNK: kullanıcı hangi ürüne
                            hangi tarihe fiyat gireceğini aramak zorunda kalmasın */}
                        <Button size="sm" variant="outline"
                          onClick={() => navigate(`/admin/fiyatlar?tab=purchase&urun=${g.productId}&date=${String(g.firstDate).slice(0, 10)}`)}>
                          Fiyat Gir
                        </Button>
                      </td>
                    </tr>,
                    acik && (
                      <tr key={`${g.productId}-detay`} className="bg-gray-50/50">
                        <td colSpan={7} className="p-3">
                          <div className="max-h-56 overflow-y-auto divide-y divide-border/60">
                            {g.entries.map((e) => (
                              <div key={e.id} className="flex items-center gap-3 py-1.5 text-xs">
                                <span className="text-text-muted w-24">{formatDate(e.createdAt).slice(0, 10)}</span>
                                <span className="flex-1 truncate">{e.producerName ?? '—'}</span>
                                <span className="tabular-nums">{formatQty(e.quantity, e.unit)}</span>
                              </div>
                            ))}
                            {g.entryCount > g.entries.length && (
                              <p className="text-xs text-text-muted pt-2">
                                …ve {g.entryCount - g.entries.length} kayıt daha
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.noProducer.count > 0 && (
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="font-bold text-text-primary">Üretici seçilmemiş</h2>
            <p className="text-sm text-text-muted">
              <strong className="text-error">{data.noProducer.count} mal kabul</strong> kaydında üretici yok —
              kime borçlu olduğumuz belli değil, borç yazılmadı. Üretici atanınca borç otomatik oluşur.
            </p>
          </div>
          <div className="bg-white border border-border rounded-2xl shadow-card overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Tarih</th>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Ürün</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">Miktar</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.noProducer.data.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="p-2 sm:p-3 text-text-secondary whitespace-nowrap">{formatDate(e.createdAt).slice(0, 10)}</td>
                    <td className="p-2 sm:p-3">{e.product.icon || '📦'} {e.product.name}</td>
                    <td className="p-2 sm:p-3 text-right tabular-nums">{formatQty(e.quantity, e.unit)}</td>
                    <td className="p-2 sm:p-3 text-right">
                      {/* İNLİNE atama: kullanıcıyı başka ekrana göndermek
                          gereksiz, API tek çağrıda borcu da üretiyor. */}
                      <div className="inline-flex items-center gap-1">
                        <select
                          value={atama[e.id] ?? ''}
                          onChange={(ev) => setAtama((a) => ({ ...a, [e.id]: ev.target.value }))}
                          className="px-2 py-1.5 rounded-lg border border-border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">Üretici seç…</option>
                          {producers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <Button size="sm" variant="outline" disabled={!atama[e.id] || busy}
                          onClick={() => uretaciAta(e.id)}>
                          <UserPlus className="w-3.5 h-3.5" /> Ata
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        onClose={() => { setConfirm(false); setDryRun(null) }}
        onConfirm={uygula}
        loading={busy}
        title="Üretici borçlarını oluştur"
        confirmLabel="Oluştur"
        description={dryRun
          ? `${dryRun.wouldWrite} mal kabul kaydı için toplam ${formatTL(dryRun.totalAmount)} üretici borcu yazılacak. `
            + (dryRun.stillUnpriced > 0 ? `${dryRun.stillUnpriced} kaydın fiyatı hâlâ yok, onlar atlanacak. ` : '')
            + 'Borcu zaten yazılmış kayıtlar ETKİLENMEZ.'
          : 'Fiyatı sonradan girilen mal kabul kayıtları için üretici borcu oluşturulacak.'}
      />
    </div>
  )
}
