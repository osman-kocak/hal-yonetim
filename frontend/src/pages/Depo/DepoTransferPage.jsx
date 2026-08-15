import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { MarketAutocomplete } from '@/components/ui/Input'
import { formatDate, formatWeight, formatQty, isCountable, qtyLabel, sumQty, unitLabel } from '@/utils/formatters'
import { Send, RefreshCw, AlertTriangle, Search, ChevronRight, ChevronDown, Undo2, Package } from 'lucide-react'

const REFRESH_INTERVAL_MS = 10_000

export function DepoTransferPage() {
  const [entries, setEntries] = useState([])
  const [markets, setMarkets] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  const [transferTarget, setTransferTarget] = useState(null) // group object
  const [expandedProducts, setExpandedProducts] = useState(() => new Set())
  const addToast = useToastStore((s) => s.addToast)
  const navigate = useNavigate()

  function toggleExpand(productId) {
    setExpandedProducts((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const [d, m] = await Promise.all([api.getDepoEntries(), api.getMarkets()])
      setEntries(d.entries ?? [])
      setMarkets(m ?? [])
    } catch (err) {
      if (!silent) addToast(err.response?.data?.error ?? 'Veriler yüklenemedi', 'error')
    } finally {
      if (!silent) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [addToast])

  // İlk yükleme + 10sn'de bir sessiz yenileme. Transfer modalı açıkken durdur.
  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (transferTarget) return // modal açıkken auto-refresh durur
    const id = setInterval(() => {
      // Sekme arka plandaysa istek atma (sessiz pause)
      if (document.hidden) return
      load(true)
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [load, transferTarget])

  const totalCases = useMemo(() => entries.reduce((s, e) => s + (e.caseCount ?? 0), 0), [entries])
  // Bağ/adet girişlerinde weight SAYI — kilo toplamına karışmamalı, bağ ile adet
  // de birbirine eklenmemeli. Üçü ayrı kova.
  const { weight: totalWeight, bunches: totalBunches, pieces: totalPieces } =
    useMemo(() => sumQty(entries), [entries])

  // Ürün + (Normal/Zayıf) + (Normal/Siyah kasa) bazında grupla.
  // Siyah kasa anahtara GİRMELİ: backend FIFO'su da aynı üç alana süzüyor.
  // Karıştırılırsa transfer istenen gruptan değil karışık havuzdan çeker,
  // grup toplamları ve stok kontrolü yalan söyler.
  //
  // GRUPLAR TÜM GİRİŞLERDEN KURULUR, aramadan bağımsız. Arama yalnızca hangi
  // grubun görüneceğini belirler (aşağıda visibleGroups).
  // NEDEN: eskiden gruplar arama sonucundan kuruluyordu; kullanıcı üretici adı
  // yazınca grup tek girişe düşüyor, ekran "en fazla 449.53 kg" diyordu — ama
  // backend her zaman tüm girişlerden FIFO alıp 423.86 hesaplıyordu. Ekranla
  // sunucu ayrışıyordu (2026-08-13, salatalık/Ali gürbüz).
  const groups = useMemo(() => {
    const map = new Map()
    for (const e of entries) {
      const productId = e.product?.id ?? 0
      const isWeak = !!e.weak
      const isDisposable = !!e.disposableCase
      // Birim de anahtarda: cutover sonrası aynı ürünün eski kasa girişleri
      // depoda durabilir; kilo ile bağ adedi tek toplamda birleştirilemez.
      const unit = e.unit ?? 'CASE'
      const key = `${productId}-${isWeak ? 'W' : 'N'}-${isDisposable ? 'D' : 'S'}-${unit}`
      if (!map.has(key)) {
        map.set(key, {
          key,
          productId,
          productName: e.product?.name ?? '—',
          weak: isWeak,
          disposableCase: isDisposable,
          unit,
          entries: [],
          totalCases: 0,
          totalWeight: 0,
          firstDate: e.createdAt,
        })
      }
      const g = map.get(key)
      g.entries.push(e)
      g.totalCases += e.caseCount ?? 0
      g.totalWeight += e.weight ?? 0
      if (new Date(e.createdAt) < new Date(g.firstDate)) g.firstDate = e.createdAt
    }
    return [...map.values()].sort((a, b) => {
      // Önce ürün adı, sonra normal -> zayıf, sonra normal kasa -> siyah kasa
      const byName = a.productName.localeCompare(b.productName, 'tr')
      if (byName !== 0) return byName
      if (a.weak !== b.weak) return a.weak ? 1 : -1
      if (a.disposableCase !== b.disposableCase) return a.disposableCase ? 1 : -1
      return a.unit.localeCompare(b.unit)
    })
  }, [entries])

  // Arama yalnızca GÖRÜNÜRLÜĞÜ süzer — grubun içeriğine, toplamlarına ve
  // transfer tavanına dokunmaz.
  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) =>
      g.productName.toLowerCase().includes(q) ||
      g.entries.some((e) =>
        e.producer?.name?.toLowerCase().includes(q) ||
        e.regionSession?.region?.name?.toLowerCase().includes(q)))
  }, [groups, query])

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text-primary">Depo Stoku — Transfer</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* İade formu artık ayrı ekranda (/iade) — ana menüden de erişilebilir */}
          <Button
            variant="outline"
            onClick={() => navigate('/iade')}
            className="flex items-center gap-2"
          >
            <Undo2 className="w-4 h-4" />
            İade Kabul
          </Button>
          <Button
            variant="outline"
            onClick={load}
            loading={refreshing}
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Yenile
          </Button>
        </div>
      </div>

      {/* Özet */}
      {/* Üç miktar ekseni ayrı kart: kg, bağ ve adet toplanamaz. Bağ/adet kartı
          yalnızca o birimde stok varsa görünür — boş kart sahada gürültü. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <SummaryCard label="Depodaki Giriş" value={entries.length} />
        <SummaryCard label="Toplam Kasa" value={totalCases} />
        <SummaryCard label="Toplam Ağırlık" value={formatWeight(totalWeight)} />
        {totalBunches > 0 && <SummaryCard label="Toplam Bağ" value={totalBunches} />}
        {totalPieces > 0 && <SummaryCard label="Toplam Adet" value={totalPieces} />}
      </div>

      {/* Arama */}
      <div className="relative mb-4 max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ürün, üretici veya bölge ara…"
          className="w-full pl-10 pr-4 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Liste */}
      <div className="bg-white border border-border rounded-2xl shadow-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" className="text-primary" /></div>
        ) : !visibleGroups.length ? (
          <EmptyState
            icon="📦"
            title={entries.length === 0 ? 'Depoda ürün yok' : 'Eşleşen kayıt yok'}
            description={entries.length === 0 ? 'Mal kabul tarafında DEPO seçilerek girişler yapıldığında burada görünür.' : 'Aramayı değiştir'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary w-6 sm:w-8"></th>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Ürün</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">
                    <span className="sm:hidden">Kasa</span>
                    <span className="hidden sm:inline">Toplam Kasa</span>
                  </th>
                  {/* Miktar mobilde de görünür: kasa artık her birimde dolu, o
                      yüzden kasa sütunu tek başına bağ/adet miktarını anlatmıyor. */}
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">
                    <span className="sm:hidden">Miktar</span>
                    <span className="hidden sm:inline">Toplam Miktar</span>
                  </th>
                  <th className="p-3 text-right font-semibold text-text-secondary hidden lg:table-cell">Giriş Sayısı</th>
                  <th className="p-3 text-left font-semibold text-text-secondary hidden lg:table-cell">İlk Giriş</th>
                  <th className="p-3 text-center font-semibold text-text-secondary hidden md:table-cell">Durum</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleGroups.map((g) => {
                  const expanded = expandedProducts.has(g.key)
                  return (
                    <Fragment key={g.key}>
                      <tr
                        onClick={() => toggleExpand(g.key)}
                        className={`cursor-pointer ${g.weak ? 'bg-error/5 hover:bg-error/10' : 'hover:bg-gray-50'}`}
                      >
                        <td className="p-2 sm:p-3 text-text-muted">
                          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="p-2 sm:p-3 font-semibold text-text-primary">
                          <div className="flex flex-col">
                            <span>{g.productName}</span>
                            {g.weak && <span className="text-[10px] sm:text-xs font-normal text-error">Zayıf</span>}
                            {g.disposableCase && (
                              <span className="text-[10px] sm:text-xs font-normal text-text-muted">Siyah/Karton Kasa</span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 sm:p-3 text-right tabular-nums font-bold text-primary">
                          {g.totalCases}
                        </td>
                        <td className="p-2 sm:p-3 text-right tabular-nums font-semibold">
                          {formatQty(g.totalWeight, g.unit)}
                        </td>
                        <td className="p-3 text-right text-text-muted tabular-nums hidden lg:table-cell">{g.entries.length}</td>
                        <td className="p-3 text-xs text-text-muted whitespace-nowrap hidden lg:table-cell">{formatDate(g.firstDate)}</td>
                        <td className="p-3 text-center hidden md:table-cell">
                          <div className="flex flex-col items-center gap-1">
                            {g.weak ? (
                              <Badge variant="error" className="inline-flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Zayıf
                              </Badge>
                            ) : (
                              <Badge variant="success">Normal</Badge>
                            )}
                            {g.disposableCase && (
                              <Badge variant="default" className="inline-flex items-center gap-1">
                                <Package className="w-3 h-3" />
                                Siyah Kasa
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-2 sm:p-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            onClick={() => setTransferTarget(g)}
                            className="inline-flex items-center gap-1 sm:gap-1.5 ml-auto"
                            title="Transfer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Transfer</span>
                          </Button>
                        </td>
                      </tr>
                      {expanded && g.entries.map((e) => (
                        <tr key={`e-${e.id}`} className="bg-gray-50/50 text-[11px] sm:text-xs">
                          <td></td>
                          <td className="p-2 pl-6 sm:pl-8 text-text-secondary" colSpan={2}>
                            <span className="text-text-muted">↳ </span>
                            {e.producer?.name ?? '—'} · {e.regionSession?.region?.name ?? '—'}
                            <div className="sm:hidden text-text-muted mt-0.5">
                              {`${e.caseCount} kasa · ${formatQty(e.weight, e.unit)}`}
                              {' · '}{formatDate(e.createdAt)}
                              {e.weak && <span className="ml-2 text-error">⚠ Zayıf</span>}
                            </div>
                          </td>
                          <td className="p-2 text-right tabular-nums hidden sm:table-cell">
                            {formatQty(e.weight, e.unit)}
                          </td>
                          <td className="p-2 text-right tabular-nums hidden lg:table-cell">
                            {`${e.caseCount} k.`}
                          </td>
                          <td className="p-2 text-text-muted whitespace-nowrap hidden lg:table-cell">{formatDate(e.createdAt)}</td>
                          <td className="p-2 text-center hidden md:table-cell">
                            {e.weak && (
                              <Badge variant="error" className="inline-flex items-center gap-1 text-[10px]">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Zayıf
                              </Badge>
                            )}
                          </td>
                          <td></td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TransferModal
        group={transferTarget}
        markets={markets.filter((m) => m.no !== 0 && m.name !== 'DEPO')}
        onClose={() => setTransferTarget(null)}
        onDone={() => { setTransferTarget(null); load() }}
      />

    </div>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div className="bg-white border border-border rounded-2xl p-4 shadow-card">
      <p className="text-xs text-text-muted uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-text-primary mt-1">{value}</p>
    </div>
  )
}

// toMarketId artık number|null (MarketAutocomplete market.id döndürüyor), eskiden
// select'ten gelen string'di. marketQuery kutuda yazan ham no — mal kabuldeki slot
// ile aynı şekil.
function makeSlot() {
  return { toMarketId: null, marketQuery: '', caseCount: '', weight: '' }
}

const round2 = (n) => Math.round(n * 100) / 100

// Backend FIFO'sunun birebir aynası (transferController.createGroupedTransfer).
//
// NEDEN GEREKLİ: backend istenen kasa adedini EN ESKİ girişlerden karşılıyor ve
// tartılan kilonun o girişlerin kayıtlı kilosunu aşmasına izin vermiyor. Ekran
// ise kiloyu grup ORTALAMASINDAN tahmin ediyordu; en eski girişler ortalamadan
// hafifse ön dolgu tavanı aşıyor ve transfer 400 ile geri dönüyordu — kullanıcı
// hiçbir şey yazmadan, sadece kasa adedi girerek imkânsız bir değer alıyordu.
//
// Her satır için ayrı sınır: backend her satırı AYRI transaction'da işliyor ve
// depoyu yeniden okuyor, yani 2. satır 1. satırın tükettiklerinden sonrasını alır.
function slotLimits(entries, slots, countable) {
  // Backend orderBy createdAt asc; buradaki liste API'den desc geliyor.
  const pool = [...(entries ?? [])]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((e) => ({ cases: e.caseCount ?? 0, weight: e.weight ?? 0 }))

  return slots.map((s) => {
    let remaining = Number(s.caseCount) || 0
    let cap = 0
    for (const p of pool) {
      if (remaining <= 0) break
      const qty = countable ? p.weight : p.cases
      if (qty <= 0) continue
      const take = Math.min(remaining, qty)
      const full = take === qty
      const share = countable ? take : (full ? p.weight : round2(p.weight * (take / p.cases)))
      cap += share
      if (countable) p.weight -= take
      else { p.cases -= take; p.weight = round2(p.weight - share) }
      remaining -= take
    }
    // remaining > 0 → bu satır için depoda yeterli stok kalmadı
    return { cap: round2(cap), short: remaining }
  })
}

function TransferModal({ group, markets, onClose, onDone }) {
  const [slots, setSlots] = useState([makeSlot()])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const addToast = useToastStore((s) => s.addToast)

  // Bağ/adet ürününde tek eksen var: istenen sayı = çıkan sayı. Tartı, fire ve
  // kilo tahmini kavramları yok. Fiziksel kasa bu ekranda ayrı sorulmuyor —
  // backend transfer edilen miktarla orantılı olarak taşıyor (bkz. takeCases).
  const countable = isCountable(group?.unit)
  const unit = group?.unit
  // Miktar kutusunun etiketi: bağ/adette birimin kendisi, kiloda kasa.
  const qtyName = countable ? qtyLabel(unit) : 'Kasa'

  // Satır bazlı kilo tavanı — backend'in izin verdiği en yüksek değer.
  // Ön dolgu ve doğrulama bunu kullanır; grup ortalaması kullanılmıyor çünkü
  // FIFO'nun seçtiği girişler ortalamadan farklı kg/kasa oranına sahip olabiliyor.
  const limits = useMemo(
    () => (group ? slotLimits(group.entries, slots, countable) : []),
    [group, slots, countable],
  )

  useEffect(() => {
    if (group) {
      setSlots([makeSlot()])
      setNote('')
      setError('')
    }
  }, [group])

  // Patch tabanlı: MarketAutocomplete tek tuşta hem marketQuery hem toMarketId
  // güncelliyor, tek alanlı imza iki ayrı setSlots'a zorluyordu.
  function updateSlot(idx, patch) {
    const p = { ...patch }
    // Kasa input'una sadece pozitif tam sayı kabul et
    if (typeof p.caseCount === 'string') {
      p.caseCount = p.caseCount.replace(/[^0-9]/g, '')
    }
    // Kilo ondalıklı: virgülü noktaya çevir, tek nokta bırak
    if (typeof p.weight === 'string') {
      let v = p.weight.replace(',', '.').replace(/[^0-9.]/g, '')
      const parts = v.split('.')
      if (parts.length > 2) v = `${parts[0]}.${parts.slice(1).join('')}`
      p.weight = v
    }
    setSlots((prev) => {
      const next = prev.map((s, i) => {
        if (i !== idx) return s
        return { ...s, ...p }
      })
      // OTOMATİK KİLO DOLDURMA YOK (Osman'ın kararı, 2026-08-13).
      // Eskiden kasa yazılınca kilo kendiliğinden doluyordu; depocu tartıya
      // bakmadan gönderiyor, tahmini değer gerçekmiş gibi kaydediliyordu.
      // Kilo artık her zaman elle giriliyor — tavan input'un altında yazıyor.

      // Son slot tam doluysa yeni boş slot ekle (mal kabul gibi)
      const last = next[next.length - 1]
      if (last.toMarketId && last.caseCount && Number(last.caseCount) > 0) {
        return [...next, makeSlot()]
      }
      return next
    })
    setError('')
  }

  function removeSlot(idx) {
    setSlots((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx))
  }

  // Dolu slotlar (geçerli olanlar). Bağ modunda kilo alanı yok — yalnızca
  // hedef + adet aranır; miktar caseCount kutusunda tutulmaya devam eder.
  const validSlots = slots.filter((s) =>
    s.toMarketId && Number(s.caseCount) > 0 && (countable || Number(s.weight) > 0))
  const totalRequested = validSlots.reduce((sum, s) => sum + Number(s.caseCount), 0)
  const totalWeightRequested = round2(validSlots.reduce((sum, s) => sum + Number(s.weight), 0))
  // Bağ modunda stok ekseni totalWeight (bağ adedi), kasa modunda totalCases
  const stock = group ? (countable ? group.totalWeight : group.totalCases) : 0
  const remaining = stock - totalRequested
  const remainingWeight = group ? round2(group.totalWeight - totalWeightRequested) : 0
  // Hedef+kasa girilmiş ama kilosu boş kalmış satır var mı (yalnız kasa modu)
  const weightMissing = !countable &&
    slots.some((s) => s.toMarketId && Number(s.caseCount) > 0 && !(Number(s.weight) > 0))

  // Depoda o kadar KASA yok — bu gerçek bir engel, backend de reddediyor.
  const stockShort = slots
    .map((s, i) => ({ i, s, lim: limits[i] }))
    .filter(({ s, lim }) => s.toMarketId && Number(s.caseCount) > 0 && lim && lim.short > 0)

  // Tartı kayıttan fazla — ENGEL DEĞİL, bilgi. Mal kabulde kilo eksik girilmiş
  // olabilir; fark transfer notuna "Tartı fazlası" olarak yazılıyor.
  //
  // TOLERANS ŞART: FIFO en eski girişten alıyor ve o giriş grubun ortalamasından
  // hafifse (canlıda salatalıkta %6) NORMAL sevkiyatta bile fark çıkıyor. Uyarı
  // her seferinde çıkarsa kimse okumaz. Kasa başı ağırlık girişten girişe doğal
  // olarak oynadığı için %15'e kadar sessiz geçiyoruz; not yine de yazılıyor.
  const overWeight = !countable && slots
    .map((s, i) => ({ i, s, lim: limits[i], fark: round2(Number(s.weight) - (limits[i]?.cap ?? 0)) }))
    .filter(({ s, lim, fark }) =>
      s.toMarketId && Number(s.weight) > 0 && lim && lim.cap > 0 &&
      fark > Math.max(lim.cap * 0.15, 5))

  async function handleSave() {
    setError('')
    if (!validSlots.length) {
      setError(countable
        ? `En az bir hedef pazar + ${unitLabel(unit)} gir`
        : 'En az bir hedef pazar + kasa ve kilo gir')
      return
    }
    if (weightMissing) { setError('Kasa girilen her satıra tartılan kiloyu da gir'); return }
    if (totalRequested > stock) {
      setError(`Toplam ${totalRequested} ${countable ? unitLabel(unit) : 'kasa'} istendi, depoda sadece ${stock} var`)
      return
    }
    // Yalnızca kasa yetersizliği engel. Kilo fazlalığı serbest — bkz. overWeight.
    if (stockShort.length) {
      const { i, s } = stockShort[0]
      setError(`${i + 1}. satır: ${s.caseCount} kasa istendi ama depoda o kadar kalmadı`)
      return
    }
    // Aynı pazara birden fazla satır olmamalı. toMarketId'ler artık hep number
    // (autocomplete market.id veriyor) — Set karşılaştırması güvenli.
    const marketIds = validSlots.map((s) => s.toMarketId)
    if (new Set(marketIds).size !== marketIds.length) {
      setError('Aynı pazara birden fazla satır var, birleştir')
      return
    }
    setSaving(true)
    try {
      // Sıralı API çağrıları — her bir transfer kendi transaction'ında
      let totalAffected = 0
      let totalShrink = 0
      for (const slot of validSlots) {
        const result = await api.createGroupedTransfer({
          productId: group.productId,
          requestedCases: Number(slot.caseCount),
          // Bağ modunda tartı yok — backend requestedWeight beklemiyor
          ...(countable ? {} : { requestedWeight: Number(slot.weight) }),
          toMarketId: slot.toMarketId,
          note: note.trim() || undefined,
          weak: group.weak,
          // Backend FIFO'su bu iki alana da süzüyor — grupla aynı olmalı,
          // yoksa karışık havuzdan çeker.
          disposableCase: group.disposableCase,
          unit: group.unit,
        })
        totalAffected += result?.entriesAffected ?? 1
        totalShrink += result?.shrink ?? 0
      }
      const tip = group.weak ? ' (zayıf)' : ''
      // shrink pozitif = fire, negatif = tartı fazlası
      const fire = totalShrink > 0.01
        ? `, ${round2(totalShrink)} kg tartı farkı`
        : totalShrink < -0.01 ? `, +${round2(-totalShrink)} kg tartı fazlası` : ''
      const miktar = countable
        ? `${totalRequested} ${unitLabel(unit)}`
        : `${totalRequested} kasa / ${totalWeightRequested} kg`
      addToast(`${miktar}${tip} ${validSlots.length} pazara dağıtıldı (${totalAffected} giriş etkilendi${fire}) ✓`)
      onDone()
    } catch (err) {
      // Hem kutuya hem toast'a: modal uzun, kutu ekranın dışında kalabiliyor ve
      // kullanıcı "hiçbir şey olmadı" sanıp tuşa tekrar tekrar basıyordu.
      const msg = errorMessage(err, 'Transfer başarısız (kısmi tamamlanmış olabilir, sayfayı yenile)')
      setError(msg)
      addToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={!!group} onClose={onClose} title="Transfer">
      {group && (
        <div className="flex flex-col gap-4">
          <div className="bg-gray-50 rounded-xl p-3 text-sm">
            <p>
              <span className="font-semibold">{group.productName}</span>
              {group.weak && <span className="ml-2 text-xs text-error font-medium">(Zayıf)</span>}
              {group.disposableCase && (
                <span className="ml-2 text-xs text-text-muted font-medium">(Siyah/Karton Kasa)</span>
              )}
              {' · '}
              {countable
                ? `${group.totalCases} kasa · ${formatQty(group.totalWeight, unit)}`
                : `${group.totalCases} kasa · ${formatWeight(group.totalWeight)}`}
            </p>
            <p className="text-xs text-text-muted mt-1">
              {group.entries.length} farklı giriş (en eski: {formatDate(group.firstDate)})
            </p>
            {group.weak && (
              <Badge variant="error" className="mt-2 inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Sadece zayıf mallar transfer edilecek
              </Badge>
            )}
            {group.disposableCase && (
              <Badge variant="default" className="mt-2 ml-2 inline-flex items-center gap-1">
                <Package className="w-3 h-3" /> Kasa hesabına girmez
              </Badge>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {slots.map((slot, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <div className="flex-1">
                  {/* Mal kabuldeki gibi pazar NO'su yazılır. markets prop'u depo
                      hariç geliyor — "0" yazılırsa eşleşme bulunmaz, seçim boş kalır. */}
                  <MarketAutocomplete
                    label="Hedef Pazar No"
                    labelClassName="text-xs mb-1 block"
                    className="px-3 py-2 text-sm"
                    markets={markets}
                    value={slot.marketQuery}
                    onChange={(v) => updateSlot(idx, { marketQuery: v })}
                    onSelect={(m) => updateSlot(idx, { toMarketId: m?.id ?? null })}
                  />
                  {slot.marketQuery && (
                    <p className={`text-[11px] mt-1 truncate ${slot.toMarketId ? 'text-primary font-medium' : 'text-error'}`}>
                      {slot.toMarketId
                        ? markets.find((m) => m.id === slot.toMarketId)?.name
                        : 'Böyle bir pazar yok'}
                    </p>
                  )}
                </div>
                <div className={countable ? 'w-28 sm:w-32' : 'w-20 sm:w-24'}>
                  <label className="text-xs font-medium text-text-secondary mb-1 block">{qtyName}</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={slot.caseCount}
                    onChange={(e) => updateSlot(idx, { caseCount: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-white text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary tabular-nums"
                  />
                </div>
                {/* Bağ/adette ikinci eksen yok: tartı da fire de olmuyor */}
                {!countable && (
                  <div className="w-24 sm:w-28">
                    <label className="text-xs font-medium text-text-secondary mb-1 block">Kilo</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={slot.weight}
                      onChange={(e) => updateSlot(idx, { weight: e.target.value })}
                      placeholder="0"
                      className={`w-full px-3 py-2 rounded-xl border bg-white text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary tabular-nums ${
                        slot.toMarketId && Number(slot.caseCount) > 0 && !(Number(slot.weight) > 0)
                          ? 'border-error' : 'border-border'
                      }`}
                    />
                    {/* Depo kaydı bilgi olarak görünür. Tartı bundan fazla olabilir —
                        fark "Tartı fazlası" olarak transfer notuna yazılır. */}
                    {/* Bilgi amaçlı: bu kasaların depodaki kayıtlı ağırlığı.
                        Yalnızca fark toleransı aşarsa renk değişir. */}
                    {Number(slot.caseCount) > 0 && limits[idx]?.cap > 0 && (
                      <p className={`text-[10px] mt-1 tabular-nums ${
                        overWeight.some((o) => o.i === idx) ? 'text-amber-700 font-semibold' : 'text-text-muted'
                      }`}>
                        depo: {limits[idx].cap} kg
                      </p>
                    )}
                  </div>
                )}
                {slots.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSlot(idx)}
                    className="self-end p-2 text-text-muted hover:text-error rounded-lg"
                    title="Sil"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs space-y-1">
            <p className="text-text-secondary flex justify-between">
              <span>Toplam transfer:</span>
              <span className="font-bold text-primary tabular-nums">
                {countable
                  ? `${totalRequested} ${unitLabel(unit)}`
                  : `${totalRequested} kasa · ${totalWeightRequested} kg`}
              </span>
            </p>
            <p className="text-text-secondary flex justify-between">
              <span>Depoda kalacak:</span>
              <span className="font-bold tabular-nums">
                <span className={remaining < 0 ? 'text-error' : 'text-text-primary'}>
                  {remaining} {countable ? unitLabel(unit) : 'kasa'}
                </span>
                {!countable && (
                  <>
                    <span className="text-text-muted"> · </span>
                    <span className={remainingWeight < 0 ? 'text-error' : 'text-text-primary'}>{remainingWeight} kg</span>
                  </>
                )}
              </span>
            </p>
            {!countable && (
              <p className="text-text-muted pt-1 border-t border-primary/10">
                Kilo, o kasaların depodaki kayıtlı ağırlığıyla doldurulur — tartıdaki
                gerçek değeri yaz. Aradaki fark fire olarak nota işlenir.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-secondary">Not (opsiyonel)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Açıklama…"
              className="w-full px-4 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Kilo fazlalığı engel değil — ama sessizce geçmesin */}
          {overWeight.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                <p className="font-semibold">Tartı depo kaydından fazla — kayıt yapılabilir:</p>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  {overWeight.map(({ i, s, lim, fark }) => (
                    <li key={i}>
                      {i + 1}. satır: depo {lim.cap} kg, tartı {s.weight} kg (<strong>+{fark} kg</strong>)
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs">
                  Fark transfer notuna “Tartı fazlası” olarak yazılır. Mal kabulde
                  kilo eksik girilmişse normaldir.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-error/10 border border-error/40 rounded-xl p-3 flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
              <p className="text-sm text-error font-medium">{error}</p>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={
                !validSlots.length || weightMissing ||
                totalRequested > stock ||
                stockShort.length > 0
              }
            >
              Transfer Et
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
