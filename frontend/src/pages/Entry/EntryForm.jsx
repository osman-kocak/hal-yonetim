import { useEffect, useState } from 'react'
import { api, isNetworkError } from '@/services/api'
import { enqueue } from '@/lib/syncQueue'
import { newClientId } from '@/lib/offlineDb'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'
import { Input, MarketAutocomplete } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { isCountable, qtyLabel, unitLabel } from '@/utils/formatters'
import { ArrowLeft, AlertTriangle, Package, Layers } from 'lucide-react'

const BATCH = 3

// Slot alanı → doğrulama hatası anahtarı. Yalnızca isim ayrışan alanlar burada;
// gerisi kendi adıyla eşleşiyor (caseCount, weight).
const ERROR_KEY_BY_FIELD = { marketId: 'market', marketQuery: 'market' }

// Siyah kasa ve B kalite SATIR BAZINDA tutuluyor (2026-08-18): aynı partide bir
// pazara siyah kasayla, diğerine normal kasayla mal gidebiliyor. Üstteki genel
// tikler "hepsine uygula" düğmesi gibi çalışır ve yeni açılan satırların
// başlangıç değerini belirler — bkz. applyToAll / updateSlot.
function makeSlot(defaults = {}) {
  return {
    caseCount: '',
    weight: '',
    marketId: null,
    marketQuery: '',
    disposableCase: !!defaults.disposableCase,
    bQuality: !!defaults.bQuality,
  }
}

// Girilmiş ama henüz kaydedilmemiş satırlar sessionStorage'da tutulur.
// NEDEN: bağlantı kesildiğinde kayıt başarısız oluyor; operatör sayfayı
// yeniliyor ya da iPad sekmeyi arka planda öldürüyor ve 20 satırlık giriş
// uçuyordu. Kayıt başarılı olunca temizlenir.
// Bu bir offline KUYRUK DEĞİL — veri sunucuya gitmez, sadece form korunur.
const DRAFT_KEY = 'hal_entry_draft'

function loadDraft(sessionId, productId) {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    // Taslak yalnızca aynı oturum + aynı ürün için geçerli; başka ürüne
    // geçildiğinde eski satırlar sızmamalı.
    if (d.sessionId !== sessionId || d.productId !== productId) return null
    return d
  } catch {
    return null
  }
}

function saveDraft(sessionId, productId, slots, weak, disposableCase, bQuality) {
  try {
    const filled = slots.filter((s) => s.caseCount || s.weight || s.marketId)
    if (!filled.length) { sessionStorage.removeItem(DRAFT_KEY); return }
    // Satır bazlı işaretler slots içinde taşınıyor; buradaki genel değerler
    // yalnızca üstteki tiklerin konumunu geri yüklemek için.
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      sessionId, productId, slots, weak, disposableCase, bQuality,
    }))
  } catch {
    // kota/private mode — taslak kritik değil
  }
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* yok say */ }
}

// countable = ürün bağ/adetle satılıyor. Miktar alanı bağ/adet sayısı olur ve
// ondalık kabul etmez. KASA ÜÇ BİRİMDE DE SORULUR (2026-08-13): bağ malı da geri
// dönen kasayla geliyor. Fark yalnızca zorunlulukta — bağ/adette kasasız
// (çuval, poşet) giriş mümkün olduğu için opsiyonel.
function SlotCard({ slot, idx, markets, onChange, errors, countable, unit }) {
  return (
    <div className="bg-white border border-border rounded-2xl p-4 flex flex-col gap-3 shadow-card">
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">#{idx + 1}</p>
      {/* Alan sırası KASA → PAZAR → MİKTAR (2026-08-18, saha isteği): operatör
          malı önce sayıyor, pazarı sonra okuyor. Enter ile alan atlama sırası
          DOM sırasını izlediği için (bkz. handleFormKeyDown) ayrıca ayar
          gerekmiyor. */}
      <div className="grid grid-cols-3 gap-3">
        <Input
          label={countable ? 'Kasa (ops.)' : 'Kasa'}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="0"
          value={slot.caseCount}
          onChange={(e) => onChange('caseCount', e.target.value.replace(/\D/g, ''))}
          error={errors?.caseCount}
        />
        <MarketAutocomplete
          label="Pazar No"
          markets={markets}
          value={slot.marketQuery}
          onChange={(v) => onChange('marketQuery', v)}
          onSelect={(m) => {
            if (m) {
              onChange('marketId', m.id)
              onChange('marketQuery', String(m.no))
            } else {
              onChange('marketId', null)
            }
          }}
          error={errors?.market}
        />
        <Input
          label={qtyLabel(unit)}
          type="text"
          inputMode={countable ? 'numeric' : 'decimal'}
          placeholder="0"
          value={slot.weight}
          onChange={(e) => {
            if (countable) {
              // Bağ/adet tam sayı: ondalık gelirse depo FIFO'su kilitlenir
              onChange('weight', e.target.value.replace(/\D/g, ''))
              return
            }
            // virgülü noktaya çevir, harf at, tek nokta tut
            let v = e.target.value.replace(/,/g, '.').replace(/[^0-9.]/g, '')
            const i = v.indexOf('.')
            if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '')
            onChange('weight', v)
          }}
          error={errors?.weight}
        />
      </div>
      {slot.marketId && !errors?.market && (
        <p className="text-xs text-primary font-medium truncate">
          {markets.find((m) => m.id === slot.marketId)?.name}
        </p>
      )}
      {/* Satır bazlı işaretler. Üstteki genel tikler bunları toplu değiştirir;
          buradan tek satır ayrıştırılabilir. */}
      <div className="flex flex-wrap gap-2">
        <SlotFlag
          active={slot.disposableCase}
          onChange={(v) => onChange('disposableCase', v)}
          icon={Package}
          label="Siyah Kasa"
          activeClass="bg-text-primary/10 text-text-primary border-text-primary/40"
        />
        <SlotFlag
          active={slot.bQuality}
          onChange={(v) => onChange('bQuality', v)}
          icon={Layers}
          label="B Kalite"
          activeClass="bg-warning/15 text-warning border-warning/40"
        />
      </div>
    </div>
  )
}

// Kart içi küçük işaret. Üstteki parti geneli tiklerle aynı görsel dil, tek
// farkı boyut — dokunma hedefi yine parmakla kullanılabilir olmalı (iPad).
function SlotFlag({ active, onChange, icon: Icon, label, activeClass }) {
  return (
    <label
      className={
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium cursor-pointer select-none transition-colors ' +
        (active ? activeClass : 'bg-gray-100 text-text-muted border-border hover:bg-gray-200')
      }
    >
      <input
        type="checkbox"
        checked={active}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5 cursor-pointer"
      />
      <Icon className="w-3.5 h-3.5" />
      {label}
    </label>
  )
}

export function EntryForm() {
  const {
    activeSession,
    selectedProducer,
    selectedProduct,
    backToProducts,
    backToProducers,
  } = useAppStore()
  const addToast = useToastStore((s) => s.addToast)

  const [markets, setMarkets] = useState([])
  // Taslak varsa oradan başla — kesinti/yenileme sonrası girilen satırlar durur
  const [slots, setSlots] = useState(() => {
    const d = loadDraft(activeSession?.id, selectedProduct?.id)
    return d?.slots?.length ? d.slots : Array.from({ length: BATCH }, () => makeSlot())
  })
  const [slotErrors, setSlotErrors] = useState([])
  const [loading, setLoading] = useState(false)
  const [confirmFinishProducer, setConfirmFinishProducer] = useState(false)
  const [weak, setWeak] = useState(() => !!loadDraft(activeSession?.id, selectedProduct?.id)?.weak)
  // Siyah/karton kasa: atılan kasa, stoklu kasa değil. Kasa muhasebesine hiç
  // girmez. weak'ten bağımsız — ikisi birlikte işaretlenebilir.
  //
  // Bu iki state artık PARTİ GENELİ TİK: değeri doğrudan kayda gitmiyor, tüm
  // satırlara uygulanıyor (applyToAll) ve yeni açılan satırların başlangıcı
  // oluyor. Gerçek değer her satırın kendi içinde (slot.disposableCase).
  const [disposableCase, setDisposableCase] = useState(
    () => !!loadDraft(activeSession?.id, selectedProduct?.id)?.disposableCase
  )
  // B kalite: yalnızca etiket. Kasa hesabına karışmaz, fiyatı değiştirmez —
  // siyah kasadan farkı bu (bkz. backend utils/cases.js).
  const [bQuality, setBQuality] = useState(
    () => !!loadDraft(activeSession?.id, selectedProduct?.id)?.bQuality
  )
  // Ürün bağ/adetle mi satılıyor? Miktar ekseni, etiketler ve doğrulama buna
  // bağlı — kasa alanı ise her birimde var.
  const unit = selectedProduct?.unit
  const countable = isCountable(unit)

  useEffect(() => {
    api.getMarkets().then(setMarkets).catch(() => {})
  }, [])

  // Her değişiklikte taslağı yaz. Kaydetme başarılı olunca temizleniyor
  // (bkz. persistEntries) — yoksa kaydedilmiş satırlar tekrar görünürdü.
  useEffect(() => {
    saveDraft(activeSession?.id, selectedProduct?.id, slots, weak, disposableCase, bQuality)
  }, [activeSession?.id, selectedProduct?.id, slots, weak, disposableCase, bQuality])

  // Parti geneli tik → tüm satırlara uygula. "Varsayılan" değil "hepsine uygula"
  // seçildi: operatör üstteki tiki açtığında tek tek 20 satırı düzeltmek zorunda
  // kalmamalı. Tikten sonra istediği satırı kartından tekrar ayarlayabilir.
  function applyToAll(field, value) {
    setSlots((prev) => prev.map((s) => ({ ...s, [field]: value })))
  }

  // Enter = sonraki form alanına geç (Tab gibi). Submit/Button'da default davranış
  function handleFormKeyDown(e) {
    if (e.key !== 'Enter') return
    if (e.target.tagName !== 'INPUT') return
    if (e.target.type === 'submit' || e.target.type === 'button') return
    e.preventDefault()
    const form = e.currentTarget
    const focusables = Array.from(
      form.querySelectorAll('input:not([disabled]), button:not([disabled])')
    )
    const idx = focusables.indexOf(e.target)
    const next = focusables[idx + 1]
    if (next) next.focus()
  }

  // Bağ/adette kasa opsiyonel — doluluk miktar + pazara bakar, yoksa kasasız
  // giriş yapan satır hiç "hazır" sayılmaz ve kayıt butonu açılmaz.
  const slotReady = (s) => !!(s.weight && s.marketId && (countable || s.caseCount))
  const slotTouched = (s) => !!(s.weight || s.marketId || s.caseCount)

  function updateSlot(idx, field, value) {
    setSlots((prev) => {
      const next = prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))

      // Son batch tamamlandıysa 3 yeni slot ekle
      const lastBatchStart = next.length - BATCH
      const lastBatch = next.slice(lastBatchStart)
      if (lastBatch.every(slotReady)) {
        // Yeni satırlar parti geneli tiklerle açılır — üstte "siyah kasa" açıkken
        // eklenen satır normal kasaya düşerse operatör fark etmez.
        return [...next, ...Array.from({ length: BATCH }, () => makeSlot({ disposableCase, bQuality }))]
      }
      return next
    })

    setSlotErrors((prev) => {
      const next = [...prev]
      // Hata anahtarı alan adıyla AYNI DEĞİL: pazar iki alandan besleniyor
      // (marketId + marketQuery) ama hatası tek anahtarda ('market') tutuluyor.
      // Eşleme olmadan pazar hatası hiç temizlenmiyordu — operatör pazarı doğru
      // seçtiği halde "Pazar seçilmeli" yazısı ekranda kalıyor, kartın altındaki
      // pazar adı da gizlendiği için seçimin tuttuğu görünmüyordu.
      const errKey = ERROR_KEY_BY_FIELD[field] ?? field
      if (next[idx]) next[idx] = { ...next[idx], [errKey]: undefined }
      return next
    })
  }

  const filledSlots = slots.filter(slotTouched)
  const readySlots = slots.filter(slotReady)

  function validate() {
    if (!filledSlots.length) {
      addToast('En az bir giriş doldurun', 'error')
      return false
    }
    const errs = Array.from({ length: slots.length }, () => ({}))
    let hasErr = false
    slots.forEach((s, i) => {
      if (!slotTouched(s)) return
      if (!countable && (!s.caseCount || Number(s.caseCount) < 1)) {
        errs[i].caseCount = 'En az 1 kasa'; hasErr = true
      }
      if (!s.weight || Number(s.weight) <= 0) {
        errs[i].weight = countable ? `Geçerli ${unitLabel(unit)} gir` : 'Geçerli kilo gir'; hasErr = true
      }
      if (!s.marketId) { errs[i].market = 'Pazar seçilmeli'; hasErr = true }
    })
    if (hasErr) { setSlotErrors(errs); return false }
    return true
  }

  // Önce doğrudan göndermeyi dener, YALNIZCA ağ hatasında offline kuyruğa düşer.
  // Dönüş: 'SENT' (sunucuda) | 'QUEUED' (iPad'de bekliyor).
  //
  // Neden "her zaman kuyruğa yaz" değil: online'da operatör anında "kaydedildi"
  // onayı görüyor, bunu kaybetmek istemiyoruz — kasa/borç hesabı sunucuda ve
  // hata (kapanmış oturum, silinmiş pazar) hemen dönmeli.
  //
  // clientId BURADA üretiliyor, ilk denemeye de gidiyor: timeout aldığımızda
  // sunucunun kaydı yazıp yanıtı kaybetmiş olma ihtimali var. Kuyruğa aynı
  // clientId ile düşünce backend ikinci kaydı yazmıyor (bkz. offlineDb.queueAdd).
  async function persistEntries() {
    const clientId = newClientId()
    const payload = {
      regionSessionId: activeSession.id,
      productId: selectedProduct.id,
      producerId: selectedProducer?.id,
      weak,
      // Parti geneli değerler geriye uyum için gönderiliyor: sunucu satır
      // değerini bulamazsa bunu kullanıyor (bkz. entryController.createEntryBatch).
      disposableCase,
      bQuality,
      entries: readySlots.map((s) => ({
        // Kasa her birimde gider; bağ/adette boş bırakılmışsa 0 (kasasız giriş)
        caseCount: Number(s.caseCount) || 0,
        weight: Number(s.weight),
        marketId: s.marketId,
        // Asıl değer burada — satır kendi işaretini taşır
        disposableCase: !!s.disposableCase,
        bQuality: !!s.bQuality,
      })),
    }

    try {
      await api.createEntryBatch({ ...payload, clientId })
      clearDraft() // sunucuya yazıldı → taslak artık geçersiz
      return 'SENT'
    } catch (err) {
      // Validasyon/yetki hatası kuyruğa GİRMEZ: tekrar denemek aynı hatayı
      // verir, operatör düzeltmeli. Taslak da silinmez, satırlar ekranda kalır.
      if (!isNetworkError(err)) throw err
      await enqueue('ENTRY_BATCH', payload, clientId)
      clearDraft() // kuyrukta kalıcı olarak duruyor, taslak kopyası artık gerekmiyor
      return 'QUEUED'
    }
  }

  // Kuyruğa alınan kayıt için mesaj: "kaydedildi" DEMİYORUZ. Operatör verinin
  // sunucuda olduğunu sanıp iPad'i kapatırsa kuyruk ilerlemez (iOS'ta arka plan
  // senkronu yok) — bu yüzden mesaj açıkça "gönderilecek" diyor.
  function savedToast(result, suffix = '') {
    if (result === 'QUEUED') {
      addToast(
        `${readySlots.length} giriş kuyruğa alındı — bağlantı gelince gönderilecek. Uygulamayı kapatmayın.${suffix}`,
        'warning'
      )
    } else {
      addToast(`${readySlots.length} giriş kaydedildi ✓${suffix}`)
    }
  }

  async function doSaveAndContinueProduct() {
    setLoading(true)
    try {
      savedToast(await persistEntries())
      backToProducts()
    } catch (err) {
      addToast(err.response?.data?.error ?? 'Kayıt başarısız', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function doSaveAndFinishProducer() {
    setLoading(true)
    try {
      const result = await persistEntries()
      savedToast(result, ' · Üretici tamamlandı')
      backToProducers()
    } catch (err) {
      addToast(err.response?.data?.error ?? 'Kayıt başarısız', 'error')
    } finally {
      setLoading(false)
      setConfirmFinishProducer(false)
    }
  }

  function handleSaveAndContinueProduct(e) {
    e?.preventDefault()
    if (!validate()) return
    doSaveAndContinueProduct()
  }

  function handleSaveAndFinishProducer() {
    doSaveAndFinishProducer()
  }

  function onFinishProducerClick() {
    if (!validate()) return
    setConfirmFinishProducer(true)
  }

  return (
    <div className="w-full">
      <button
        onClick={backToProducts}
        className="flex items-center gap-1 text-text-muted hover:text-text-primary text-sm mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Ürün listesine dön
      </button>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {selectedProducer && (
          <Badge variant="default" className="text-base px-3 py-1">
            👤 {selectedProducer.name}
          </Badge>
        )}
        <Badge variant="primary" className="text-base px-3 py-1">{selectedProduct?.name}</Badge>
        <label
          className={
            'inline-flex items-center gap-2 rounded-full font-semibold text-base px-3 py-1 cursor-pointer select-none transition-colors ' +
            (weak
              ? 'bg-error/15 text-error border border-error/40'
              : 'bg-gray-100 text-text-muted border border-border hover:bg-gray-200')
          }
        >
          <input
            type="checkbox"
            checked={weak}
            onChange={(e) => setWeak(e.target.checked)}
            className="w-4 h-4 accent-error cursor-pointer"
          />
          <AlertTriangle className="w-4 h-4" />
          Zayıf Mal
        </label>
        {/* Siyah/karton kasa: kasa muhasebesine hiç girmez (atılan kasa).
            Zayıf Mal'dan bağımsız, ikisi birlikte seçilebilir.
            Bu tik PARTİNİN TAMAMINA uygulanır; tek satırı ayrıştırmak için
            kartın kendi "Siyah Kasa" işareti kullanılır. */}
        <label
          title="Siyah/karton kasa — atılan kasa, kasa hesabına girmez. Tüm satırlara uygulanır."
          className={
            'inline-flex items-center gap-2 rounded-full font-semibold text-base px-3 py-1 cursor-pointer select-none transition-colors ' +
            (disposableCase
              ? 'bg-text-primary/10 text-text-primary border border-text-primary/40'
              : 'bg-gray-100 text-text-muted border border-border hover:bg-gray-200')
          }
        >
          <input
            type="checkbox"
            checked={disposableCase}
            onChange={(e) => {
              setDisposableCase(e.target.checked)
              applyToAll('disposableCase', e.target.checked)
            }}
            className="w-4 h-4 accent-gray-700 cursor-pointer"
          />
          <Package className="w-4 h-4" />
          Siyah/Karton Kasa
        </label>
        {/* B kalite: SADECE ETİKET. Kasa hesabına karışmaz, fiyatı değiştirmez —
            siyah kasadan farkı bu. Kaldırılan Quality tablosuyla ilgisi yok. */}
        <label
          title="İkinci kalite — kasa hesabını ve fiyatı etkilemez, yalnızca işaret. Tüm satırlara uygulanır."
          className={
            'inline-flex items-center gap-2 rounded-full font-semibold text-base px-3 py-1 cursor-pointer select-none transition-colors ' +
            (bQuality
              ? 'bg-warning/15 text-warning border border-warning/40'
              : 'bg-gray-100 text-text-muted border border-border hover:bg-gray-200')
          }
        >
          <input
            type="checkbox"
            checked={bQuality}
            onChange={(e) => {
              setBQuality(e.target.checked)
              applyToAll('bQuality', e.target.checked)
            }}
            className="w-4 h-4 accent-amber-600 cursor-pointer"
          />
          <Layers className="w-4 h-4" />
          B Kalite
        </label>
      </div>

      <form onSubmit={handleSaveAndContinueProduct} onKeyDown={handleFormKeyDown}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {slots.map((slot, idx) => (
            <SlotCard
              key={idx}
              slot={slot}
              idx={idx}
              markets={markets}
              onChange={(field, value) => updateSlot(idx, field, value)}
              errors={slotErrors[idx]}
              countable={countable}
              unit={unit}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button type="submit" size="xl" loading={loading} className="w-full">
            {readySlots.length > 1 ? `${readySlots.length} Girişi Kaydet` : 'Girişi Kaydet'}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="xl"
            loading={loading}
            onClick={onFinishProducerClick}
            className="w-full"
          >
            Girişi Kaydet ve Üreticiyi Tamamla
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmFinishProducer}
        onClose={() => setConfirmFinishProducer(false)}
        onConfirm={handleSaveAndFinishProducer}
        loading={loading}
        title="Üreticiyi Tamamla"
        description={`${readySlots.length} giriş kaydedilecek ve ${selectedProducer?.name ?? 'üretici'} tamamlanacak. Devam edilsin mi?`}
        confirmLabel="Evet, Tamamla"
      />

    </div>
  )
}
