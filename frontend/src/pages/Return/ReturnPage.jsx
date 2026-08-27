import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage, isNetworkError } from '@/services/api'
import { enqueue } from '@/lib/syncQueue'
import { newClientId } from '@/lib/offlineDb'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import { Button } from '@/components/ui/Button'
import { MarketAutocomplete } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatDate, formatQty, isCountable, priceLabel, qtyLabel, unitLabel } from '@/utils/formatters'
import { previewTare } from '@/utils/tare'
import { LogOut, ArrowLeft, RotateCcw, RefreshCw, X, AlertTriangle } from 'lucide-react'

const DESTINATIONS = [
  { key: 'DEPO', label: '📦 Depo', hint: 'Depoya al, sonra sevk et' },
  { key: 'MARKET', label: '🔄 Başka pazar', hint: 'Doğrudan yönlendir' },
  { key: 'DISCARD', label: '🗑 İmha', hint: '99 ATILAN — fire' },
]

// Bir iade satırı. Hedef satır bazında: aynı bayiden gelen malın bir kısmı
// depoya, bir kısmı imhaya gidebiliyor.
// weak varsayılan true — iade genelde zayıf maldır.
function makeSlot() {
  return {
    productId: '', caseCount: '', weight: '', pricePerKg: '',
    destination: 'DEPO', toMarketId: '',
    weak: true, disposableCase: false,
  }
}

export function ReturnPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const addToast = useToastStore((s) => s.addToast)

  const [markets, setMarkets] = useState([])
  const [products, setProducts] = useState([])
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Form — mal kabul ekranıyla aynı desen: bayi bir kez seçilir, altında
  // satırlar açılır, son satır dolunca yenisi kendiliğinden eklenir.
  const [fromMarketId, setFromMarketId] = useState('')
  const [dealerQuery, setDealerQuery] = useState('') // kutuda yazan pazar no
  const [slots, setSlots] = useState(() => [makeSlot()])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tekrarOnay, setTekrarOnay] = useState(false)
  // Buton loading'de kilitleniyor ama setSaving asenkron: iki tıklama arası
  // re-render'dan kısaysa ikincisi de geçer. Ref senkron kapanır.
  const gonderiliyor = useRef(false)

  // Bayiye son 7 günde ne gönderildi / ne iade alındı. Yanlış ürün ya da yanlış
  // bayi seçimini yakalamak için: canlıda 17 iadenin 6'sı bayiye hiç
  // gönderilmemiş üründendi (2026-08-13).
  const [balance, setBalance] = useState(null)
  const [balanceLoading, setBalanceLoading] = useState(false)

  // DEPO (0) ve ATILAN (99) bayi değil — bayi/hedef listelerinde görünmemeli
  const dealerMarkets = markets.filter((m) => !m.isSpecial)
  const targetMarkets = dealerMarkets.filter((m) => String(m.id) !== String(fromMarketId))

  const unitOf = (pid) => products.find((p) => String(p.id) === String(pid))?.unit

  // Bayi değişince bakiye yeniden çekilir. Satırlar da sıfırlanır — önceki
  // bayiye girilmiş satırlar yeni bayinin hesabına yazılmasın.
  function selectDealer(id) {
    setFromMarketId(id)
    setSlots([makeSlot()])
    setError('')
    setBalance(null)
    if (!id) return
    setBalanceLoading(true)
    api.getMarketBalance(id)
      .then(setBalance)
      // ULAŞILAMADI ile "hiç gönderilmemiş" AYNI ŞEY DEĞİL. Eskiden ikisi de
      // boş liste oluyordu ve ekran kesintide "bu bayiye hiç irsaliye
      // kesilmemiş" diyordu — operatöre yanlış bilgi. Artık ayrı işaretleniyor:
      // offline'da kontrol yapılamadığı söyleniyor, uydurma uyarı verilmiyor.
      .catch(() => setBalance({ products: [], unavailable: true }))
      .finally(() => setBalanceLoading(false))
  }

  // Seçili ürün bu bayiye son 7 günde gönderilmiş mi, ne kadar kalmış?
  const sentInfo = (pid) => balance?.products?.find((p) => String(p.productId) === String(pid)) ?? null
  // Satır girilmeye başlanmış mı / kaydedilmeye hazır mı
  const slotTouched = (s) => !!(s.productId || s.caseCount || s.weight)
  const slotReady = (s) => {
    if (!s.productId || !(Number(s.weight) > 0)) return false
    // Kilo ürününde kasa zorunlu; bağ/adette kasasız (çuval/poşet) iade olabilir.
    if (!isCountable(unitOf(s.productId)) && !(Number(s.caseCount) > 0)) return false
    if (s.destination === 'MARKET' && !s.toMarketId) return false
    return true
  }

  function updateSlot(idx, patch) {
    setSlots((prev) => {
      const next = prev.map((s, i) => (i === idx ? { ...s, ...patch } : s))
      // Son satır tamamlandıysa altına yenisi açılır — aynı bayiden gelen
      // diğer iadeler için (mal kabuldeki davranışın aynısı).
      if (slotReady(next[next.length - 1])) next.push(makeSlot())
      return next
    })
    setError('')
    // Satır değişti — tekrar onayı düşer. Onaylayıp sonra satır ekleyen
    // kullanıcı eski onayla göndermesin.
    setTekrarOnay(false)
  }

  function removeSlot(idx) {
    setSlots((prev) => (prev.length === 1 ? [makeSlot()] : prev.filter((_, i) => i !== idx)))
    setError('')
    setTekrarOnay(false)
  }

  const readySlots = slots.filter(slotReady)

  // Kaydetmeden önceki son uyarı: hangi satırlar şüpheli. Engellemiyoruz —
  // sistem öncesi teslimat ya da elden verilen mal olabilir; bloklamak meşru
  // düzeltmeleri de keserdi. Ama operatör bilerek onaylasın.
  const supheli = readySlots
    .map((s) => {
      if (!balance || balance.unavailable) return null
      const info = sentInfo(s.productId)
      const ad = products.find((p) => String(p.id) === String(s.productId))?.name ?? '?'
      if (!info) return `${ad}: bu bayiye son 7 günde gönderilmemiş`
      const girilen = Number(s.weight) || 0
      if (girilen > info.netQty) {
        const birim = unitLabel(info.unit)
        return `${ad}: ${girilen} ${birim} iade, kalan ${info.netQty} ${birim}`
      }
      return null
    })
    .filter(Boolean)

  // AYNI ÜRÜN BİRDEN FAZLA SATIRDA (24 Ağu 2026).
  //
  // Form son satır dolunca altına yenisini açıyor. Operatör ilk satırı yanlış
  // doldurup (hedefi karıştırıp) doğrusunu alttaki satıra yazınca, eskisini
  // silmeyi unutabiliyor — iki satır da kaydediliyor. O gün böyle oldu: aynı
  // 14 kasa karpuz iki kez işlendi, bayinin cari hesabına 8.800 yerine 17.600
  // alacak, kasa hesabına 14 yerine 28 kasa geçti.
  //
  // Engellemiyoruz, onay istiyoruz: aynı üründen iki ayrı iade meşru olabilir
  // (farklı fiyat, biri imha biri depo). Ama toplam görülerek onaylansın.
  const tekrarlar = (() => {
    const sayac = new Map()
    for (const s of readySlots) {
      const cur = sayac.get(s.productId) ?? { adet: 0, kasa: 0, miktar: 0 }
      cur.adet += 1
      cur.kasa += Number(s.caseCount) || 0
      cur.miktar += Number(s.weight) || 0
      sayac.set(s.productId, cur)
    }
    return [...sayac.entries()]
      .filter(([, v]) => v.adet > 1)
      .map(([pid, v]) => {
        const ad = products.find((p) => String(p.id) === String(pid))?.name ?? '?'
        return `${ad}: ${v.adet} satır · toplam ${v.kasa} kasa / ${v.miktar} ${unitLabel(unitOf(pid))}`
      })
  })()

  const loadRecent = useCallback(async () => {
    setRefreshing(true)
    try {
      setRecent(await api.listRecentReturns(10))
    } catch {
      // son kayıtlar kritik değil — form çalışmaya devam etsin
    } finally {
      setRefreshing(false)
    }
  }, [])

  // Tek effect: bayi/ürün listeleri + son iadeler birlikte gelir. setState'ler
  // yalnızca async callback içinde çağrılır (senkron setState effect'i tetikler).
  useEffect(() => {
    Promise.all([api.getMarkets(), api.getProducts(), api.listRecentReturns(10)])
      .then(([m, p, r]) => { setMarkets(m ?? []); setProducts(p ?? []); setRecent(r ?? []) })
      .catch(() => addToast('Liste yüklenemedi', 'error'))
      .finally(() => setLoading(false))
  }, [addToast])

  function resetForm() {
    setFromMarketId('')
    setDealerQuery('')
    setSlots([makeSlot()])
    setNote('')
    setError('')
    setBalance(null)
    setTekrarOnay(false)
  }

  async function handleSave() {
    // Senkron kilit: buton disabled'a düşmeden gelen ikinci tıklamayı burada
    // kesiyoruz. Cari hesaba yazan bir işlem — "muhtemelen yetişmez" yetmez.
    if (gonderiliyor.current) return
    setError('')
    if (!fromMarketId) { setError('İade veren bayi seçilmeli'); return }
    if (!readySlots.length) { setError('En az bir iade satırı doldurun'); return }
    if (tekrarlar.length && !tekrarOnay) {
      setError('Aynı ürün birden fazla satırda — toplamı kontrol edip onaylayın')
      return
    }

    // Yarım kalmış satır varsa uyar — sessizce atlanırsa mal kaydedilmemiş olur
    const yarim = slots.findIndex((s) => slotTouched(s) && !slotReady(s))
    if (yarim !== -1) {
      setError(`${yarim + 1}. satır eksik — ürün, miktar ve (başka pazara gidiyorsa) hedef gerekli`)
      return
    }

    gonderiliyor.current = true
    setSaving(true)
    try {
      // TEK istek, TEK transaction: satırlardan biri patlarsa hiçbiri yazılmaz.
      // Sıralı ayrı isteklerde yarısı cari hesaba işlenip yarısı kalırdı.
      //
      // clientId BURADA üretiliyor ve ilk denemeye de gidiyor: timeout aldığımızda
      // sunucu kaydı yazıp yanıtı kaybetmiş olabilir. Kuyruğa aynı anahtarla
      // düşünce backend ikinci kez yazmıyor (bkz. SyncedBatch) — iade cari hesaba
      // kredi yazdığı için çift kayıt doğrudan para hatası olurdu.
      //
      // occurredAt: iadenin gerçek zamanı. Kuyrukta bekleyen kayıt saatler sonra
      // gidebiliyor; sunucu sync anını yazsa cari hesap yanlış güne düşerdi.
      const clientId = newClientId()
      const payload = {
        fromMarketId: Number(fromMarketId),
        occurredAt: new Date().toISOString(),
        rows: readySlots.map((s) => {
          return {
            productId: Number(s.productId),
            // Kasa her birimde gider; bağ/adette boş bırakılmışsa kasasız iade
            caseCount: Number(s.caseCount) || 0,
            weight: Number(s.weight),
            weak: s.weak,
            disposableCase: s.disposableCase,
            destination: s.destination,
            toMarketId: s.destination === 'MARKET' ? Number(s.toMarketId) : undefined,
            pricePerKg: s.pricePerKg ? Number(s.pricePerKg) : undefined,
            note: note.trim() || undefined,
          }
        }),
      }

      let result
      try {
        result = await api.createDepoReturnBatch({ ...payload, clientId })
      } catch (err) {
        // Validasyon/yetki hatası kuyruğa GİRMEZ: tekrar denemek aynı hatayı
        // verir, operatör düzeltmeli. Form da temizlenmez.
        if (!isNetworkError(err)) throw err
        await enqueue('RETURN_BATCH', payload, clientId)
        addToast(
          `${readySlots.length} iade kuyruğa alındı — bağlantı gelince gönderilecek. ` +
          'Uygulamayı kapatmayın. Bayi borcu, kayıt sunucuya ulaşınca düşecek.',
          'warning'
        )
        resetForm()
        return
      }

      const bayi = dealerMarkets.find((m) => String(m.id) === String(fromMarketId))
      addToast(
        `${result.count} iade kaydedildi · ${bayi?.name ?? 'Bayi'} borcundan ` +
        `₺${result.totalAmount.toFixed(2)} düşüldü ✓`
      )
      // Fiyatı bulunamayan satırlar borçtan 0₺ düşer — sessizce geçilmemeli
      if (result.priceMissingRows?.length) {
        const adlar = result.priceMissingRows.map((r) => r.product).join(', ')
        addToast(`⚠ Fiyat tanımlı değil: ${adlar} — borçtan ₺0 düşüldü, fiyatı elle girin`, 'error')
      }
      resetForm()
      loadRecent()
    } catch (err) {
      setError(errorMessage(err, 'İade kaydı başarısız'))
    } finally {
      gonderiliyor.current = false
      setSaving(false)
    }
  }

  function handleLogout() {
    logout()
    navigate('/giris')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-white border-b border-border px-4 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-gray-100 text-text-muted shrink-0" title="Ana sayfaya dön">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <span className="text-2xl shrink-0">🔄</span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-text-primary leading-none">İade Kabul</h1>
              {user?.name && <p className="text-xs text-text-muted mt-1 truncate">{user.name}</p>}
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-gray-100 text-text-muted shrink-0" title="Çıkış">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="p-4 sm:p-6 max-w-3xl mx-auto flex flex-col gap-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
          Bayiden gelen iade mal kayda alınır: bayi borcundan değer düşülür, bayi kasa bakiyesinden
          sayı eksilir. Mal seçtiğiniz yere yazılır.
        </div>

        <div className="bg-white border border-border rounded-2xl shadow-card p-5 sm:p-6 flex flex-col gap-5">
          {/* Bayi bir kez seçilir; altındaki tüm satırlar onun hesabına işlenir.
              Dropdown yerine pazar NO'su yazılıyor — mal kabul ve depo transferle
              aynı alışkanlık, 60+ bayilik listede aramaktan hızlı. */}
          <div>
            <MarketAutocomplete
              label="İade Veren Bayi No"
              markets={dealerMarkets}
              value={dealerQuery}
              onChange={setDealerQuery}
              onSelect={(m) => selectDealer(m?.id ? String(m.id) : '')}
            />
            {dealerQuery && (
              <p className={`text-sm mt-1 ${fromMarketId ? 'text-primary font-medium' : 'text-error'}`}>
                {fromMarketId
                  ? dealerMarkets.find((m) => String(m.id) === String(fromMarketId))?.name
                  : 'Böyle bir bayi yok'}
              </p>
            )}
          </div>

          {!fromMarketId ? (
            <p className="text-sm text-text-muted bg-gray-50 rounded-xl p-4 text-center">
              Önce iade veren bayiyi seç — sonra iade edilen ürünleri tek tek gir.
            </p>
          ) : (
            <>
              {balanceLoading && (
                <p className="text-xs text-text-muted">Bayinin son 7 günlük sevkiyatı yükleniyor…</p>
              )}
              {/* Kontrol yapılamadı (kesinti): sessiz kalmak yerine açıkça söyle —
                  operatör hangi korumanın devre dışı olduğunu bilmeli. */}
              {balance?.unavailable && (
                <div className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-text-secondary">
                  ⚠ Bağlantı yok — <strong className="text-text-primary">gönderi geçmişi kontrolü yapılamadı</strong>.
                  İade kaydedilebilir ama "bu ürün bu bayiye gönderilmiş mi" uyarısı çalışmaz, ürünü ve miktarı iki kez kontrol edin.
                </div>
              )}
              {balance && !balance.unavailable && balance.products?.length === 0 && (
                <div className="bg-error/10 border border-error/40 rounded-xl p-3 flex gap-2 items-start">
                  <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                  <p className="text-sm text-error font-medium">
                    Bu bayiye son {balance.windowDays ?? 7} günde hiç irsaliye kesilmemiş.
                    İade kaydedilebilir ama önce doğru bayiyi seçtiğinden emin ol.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {slots.map((slot, idx) => (
                  <ReturnSlotCard
                    key={idx}
                    idx={idx}
                    slot={slot}
                    products={products}
                    targetMarkets={targetMarkets}
                    unit={unitOf(slot.productId)}
                    canRemove={slots.length > 1 || slotTouched(slot)}
                    onChange={(patch) => updateSlot(idx, patch)}
                    onRemove={() => removeSlot(idx)}
                    balance={balance}
                    sent={sentInfo(slot.productId)}
                  />
                ))}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-text-secondary">Not (opsiyonel)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Tüm satırlara yazılır…"
                  className="w-full px-4 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Kaydetmeden önce toplu uyarı — tek tek satırlarda da yazıyor
                  ama buton başında son bir kez gözüne sokuyoruz. */}
              {supheli.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex gap-2 items-start">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-900">
                    <p className="font-semibold">Kontrol et — kayıt yine de yapılabilir:</p>
                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                      {supheli.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              {/* Tekrar uyarısı şüpheli listesinden AYRI ve daha sert: orada
                  bilgi veriliyor, burada onay isteniyor. Aynı malı iki kez
                  işlemek cari hesabı ve kasayı ikiye katlıyor. */}
              {tekrarlar.length > 0 && (
                <div className="bg-error/10 border border-error/40 rounded-xl p-3 flex gap-2 items-start">
                  <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                  <div className="text-sm text-error">
                    <p className="font-semibold">Aynı ürün birden fazla satırda:</p>
                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                      {tekrarlar.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                    <label className="flex items-center gap-2 mt-2 font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tekrarOnay}
                        onChange={(e) => setTekrarOnay(e.target.checked)}
                        className="w-4 h-4 accent-error"
                      />
                      Toplamı kontrol ettim, doğru
                    </label>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-error/10 border border-error/40 rounded-xl p-3 flex gap-2 items-start">
                  <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                  <p className="text-sm text-error font-medium">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={resetForm} disabled={saving} className="sm:w-auto">
                  Temizle
                </Button>
                <Button
                  onClick={handleSave}
                  loading={saving}
                  size="lg"
                  className="flex-1"
                  disabled={!readySlots.length || (tekrarlar.length > 0 && !tekrarOnay)}
                >
                  {readySlots.length > 1 ? `${readySlots.length} İadeyi Kaydet` : 'İadeyi Kaydet'}
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="bg-white border border-border rounded-2xl shadow-card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-amber-600" />
              Son İadeler
            </h2>
            <button
              onClick={loadRecent}
              className="p-2 rounded-lg hover:bg-gray-100 text-text-muted"
              title="Yenile"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {recent.length === 0 ? (
            <p className="text-sm text-text-muted">Henüz iade kaydı yok</p>
          ) : (
            <div className="divide-y divide-border">
              {recent.map((r) => (
                <div key={r.id} className="py-3 flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="text-text-primary font-medium truncate">
                      {r.product?.name ?? '—'} · {`${r.caseCount} kasa · ${formatQty(r.weight, r.unit)}`}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5 truncate">
                      {r.market ? `#${r.market.no} ${r.market.name}` : '—'} · {formatDate(r.createdAt)}
                      {r.discarded && ' · imha'}
                    </p>
                  </div>
                  <span className="text-text-primary font-semibold tabular-nums shrink-0">
                    ₺{(r.amount ?? 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}


// Tek iade satırı. Mal kabuldeki SlotCard deseni: kart içinde alanlar, dolunca
// altına yenisi açılır. Hedef satır bazında — aynı bayiden gelen malın bir
// kısmı depoya, bir kısmı imhaya gidebiliyor.
function ReturnSlotCard({
  idx, slot, products, targetMarkets, unit, canRemove, onChange, onRemove, balance, sent,
}) {
  // Bağ/adet ürününde miktar sayı olarak girilir; kasa üç birimde de sorulur
  // (bağ malı da kasayla geri gelebilir), yalnızca zorunluluğu değişir.
  const countable = isCountable(unit)
  // Bayiye son 7 günde gönderilen ürünler üstte ayrı grupta — operatör doğru
  // olanı seçsin, yanlış ürün seçmek için ekstra çaba gereksin.
  const sentIds = new Set((balance?.products ?? []).map((p) => String(p.productId)))
  const gonderilen = products.filter((p) => sentIds.has(String(p.id)))
  const digerleri = products.filter((p) => !sentIds.has(String(p.id)))

  const girilen = Number(slot.weight) || 0
  const birim = unitLabel(unit)
  // Kasa darası — mal kabulle aynı kural (utils/tare.js). Girilen kilo brüt.
  const dara = previewTare({
    unit,
    caseCount: slot.caseCount,
    disposableCase: slot.disposableCase,
    weight: slot.weight,
  })
  // Uyarı üç durumda: ürün hiç gönderilmemiş / kalandan fazla iade / kalan sıfır
  const hicYok = slot.productId && balance && !sent
  const fazla = sent && girilen > 0 && girilen > sent.netQty

  return (
    <div className="bg-gray-50 border border-border rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">#{idx + 1}</span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded-lg text-text-muted hover:text-error hover:bg-error/10"
            title="Satırı sil"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary">Ürün</label>
        <select
          value={slot.productId}
          onChange={(e) => onChange({ productId: e.target.value })}
          className={`w-full px-3 py-2.5 rounded-xl border bg-white text-base focus:outline-none focus:ring-2 focus:ring-primary ${
            hicYok ? 'border-error' : 'border-border'
          }`}
        >
          <option value="">Seçin…</option>
          {gonderilen.length > 0 && (
            <optgroup label="✓ Bu bayiye gönderilenler (son 7 gün)">
              {gonderilen.map((p) => (
                <option key={p.id} value={p.id}>{p.icon ? `${p.icon} ` : ''}{p.name}</option>
              ))}
            </optgroup>
          )}
          <optgroup label={gonderilen.length > 0 ? '⚠ Gönderilmemiş ürünler' : 'Ürünler'}>
            {digerleri.map((p) => (
              <option key={p.id} value={p.id}>{p.icon ? `${p.icon} ` : ''}{p.name}</option>
            ))}
          </optgroup>
        </select>

        {/* Seçilen ürünün bu bayideki durumu — operatör kaydetmeden önce görsün */}
        {hicYok && (
          <p className="text-xs text-error font-semibold flex items-start gap-1 mt-0.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            Bu ürün bu bayiye son 7 günde hiç gönderilmemiş — bayiyi ve ürünü kontrol et
          </p>
        )}
        {sent && (
          <p className={`text-xs mt-0.5 tabular-nums ${fazla ? 'text-error font-semibold' : 'text-text-muted'}`}>
            Gönderilen {sent.sentQty} {birim} · İade {sent.returnedQty} {birim} ·{' '}
            <strong>Kalan {sent.netQty} {birim}</strong>
            {fazla && ` — ${girilen} ${birim} iade kalandan fazla!`}
          </p>
        )}
      </div>

      {/* Kasa üç birimde de sorulur — bağ/adet malı da geri dönen kasayla
          gelebiliyor. Bağ/adette opsiyonel: çuval/poşetle gelen iadede boş kalır. */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">
            {countable ? 'Kasa (ops.)' : 'Kasa'}
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={slot.caseCount}
            onChange={(e) => onChange({ caseCount: e.target.value.replace(/\D/g, '') })}
            placeholder="0"
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">{qtyLabel(unit)}</label>
          <input
            type="text"
            inputMode={countable ? 'numeric' : 'decimal'}
            value={slot.weight}
            onChange={(e) => {
              // Bağ/adet tam sayı; kiloda virgül noktaya çevrilir, tek nokta bırakılır
              if (countable) return onChange({ weight: e.target.value.replace(/\D/g, '') })
              let v = e.target.value.replace(/,/g, '.').replace(/[^0-9.]/g, '')
              const i = v.indexOf('.')
              if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '')
              onChange({ weight: v })
            }}
            placeholder="0"
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {/* İade de tartılıyor: girilen kilo BRÜT, bayinin borcundan düşülen
              tutar NET üzerinden hesaplanır (bkz. utils/tare.js). */}
          {dara.uygulandi && (
            dara.gecersiz
              ? <p className="text-[11px] font-semibold text-error">{dara.tare} kg dara, girilenden fazla</p>
              : <p className="text-[11px] text-text-secondary tabular-nums">
                  −{dara.tare} kg dara → <strong className="text-primary">{dara.net} kg net</strong>
                </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">{priceLabel(unit)}</label>
          <input
            type="text"
            inputMode="decimal"
            value={slot.pricePerKg}
            onChange={(e) => onChange({ pricePerKg: e.target.value.replace(/,/g, '.').replace(/[^0-9.]/g, '') })}
            placeholder="Bugünkü"
            title="Boş bırakırsanız sistem bugünkü fiyat tablosundan otomatik alır"
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-1.5">
          {DESTINATIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange({ destination: opt.key, toMarketId: '' })}
              title={opt.hint}
              className={`flex-1 px-2 py-2 rounded-xl border-2 text-xs font-medium transition-all ${
                slot.destination === opt.key
                  ? 'border-primary bg-primary-light text-primary-dark'
                  : 'border-border bg-white text-text-secondary hover:border-primary/40'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {slot.destination === 'MARKET' && (
          <select
            value={slot.toMarketId}
            onChange={(e) => onChange({ toMarketId: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Hedef pazar seçin…</option>
            {targetMarkets.map((m) => (
              <option key={m.id} value={m.id}>#{m.no} {m.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={slot.weak}
            onChange={(e) => onChange({ weak: e.target.checked })}
            className="w-4 h-4 rounded accent-error"
          />
          <span className="text-xs text-text-secondary">Zayıf mal</span>
        </label>
        {/* İşaretliyse bayinin kasa borcundan düşülmez — o kasa zaten
            bayiye yazılmamıştı (atılan kasa). */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={slot.disposableCase}
            onChange={(e) => onChange({ disposableCase: e.target.checked })}
            className="w-4 h-4 rounded accent-gray-700"
          />
          <span className="text-xs text-text-secondary">
            Siyah/karton kasa <span className="text-text-muted">— kasa hesabına girmez</span>
          </span>
        </label>
      </div>
    </div>
  )
}
