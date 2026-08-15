import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'
import { Input, MarketAutocomplete } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { isCountable, qtyLabel, unitLabel } from '@/utils/formatters'
import { ArrowLeft, AlertTriangle, Package } from 'lucide-react'

const BATCH = 3

function makeSlot() {
  return { caseCount: '', weight: '', marketId: null, marketQuery: '' }
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

function saveDraft(sessionId, productId, slots, weak, disposableCase) {
  try {
    const filled = slots.filter((s) => s.caseCount || s.weight || s.marketId)
    if (!filled.length) { sessionStorage.removeItem(DRAFT_KEY); return }
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      sessionId, productId, slots, weak, disposableCase,
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
      <div className="grid grid-cols-3 gap-3">
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
          label={countable ? 'Kasa (ops.)' : 'Kasa'}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="0"
          value={slot.caseCount}
          onChange={(e) => onChange('caseCount', e.target.value.replace(/\D/g, ''))}
          error={errors?.caseCount}
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
    </div>
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
    return d?.slots?.length ? d.slots : Array.from({ length: BATCH }, makeSlot)
  })
  const [slotErrors, setSlotErrors] = useState([])
  const [loading, setLoading] = useState(false)
  const [confirmFinishProducer, setConfirmFinishProducer] = useState(false)
  const [weak, setWeak] = useState(() => !!loadDraft(activeSession?.id, selectedProduct?.id)?.weak)
  // Siyah/karton kasa: atılan kasa, stoklu kasa değil. Kasa muhasebesine hiç
  // girmez. weak'ten bağımsız — ikisi birlikte işaretlenebilir.
  const [disposableCase, setDisposableCase] = useState(
    () => !!loadDraft(activeSession?.id, selectedProduct?.id)?.disposableCase
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
    saveDraft(activeSession?.id, selectedProduct?.id, slots, weak, disposableCase)
  }, [activeSession?.id, selectedProduct?.id, slots, weak, disposableCase])

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
        return [...next, ...Array.from({ length: BATCH }, makeSlot)]
      }
      return next
    })

    setSlotErrors((prev) => {
      const next = [...prev]
      if (next[idx]) next[idx] = { ...next[idx], [field]: undefined }
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

  async function persistEntries() {
    await api.createEntryBatch({
      regionSessionId: activeSession.id,
      productId: selectedProduct.id,
      producerId: selectedProducer?.id,
      weak,
      disposableCase,
      entries: readySlots.map((s) => ({
        // Kasa her birimde gider; bağ/adette boş bırakılmışsa 0 (kasasız giriş)
        caseCount: Number(s.caseCount) || 0,
        weight: Number(s.weight),
        marketId: s.marketId,
      })),
    })
    // Sunucuya yazıldı → taslak artık geçersiz
    clearDraft()
  }

  async function doSaveAndContinueProduct() {
    setLoading(true)
    try {
      await persistEntries()
      addToast(`${readySlots.length} giriş kaydedildi ✓`)
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
      await persistEntries()
      addToast(`${readySlots.length} giriş kaydedildi · Üretici tamamlandı ✓`)
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
            Zayıf Mal'dan bağımsız, ikisi birlikte seçilebilir. */}
        <label
          title="Siyah/karton kasa — atılan kasa, kasa hesabına girmez"
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
            onChange={(e) => setDisposableCase(e.target.checked)}
            className="w-4 h-4 accent-gray-700 cursor-pointer"
          />
          <Package className="w-4 h-4" />
          Siyah/Karton Kasa
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
