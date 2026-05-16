import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'
import { Input, MarketAutocomplete } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ArrowLeft, AlertTriangle } from 'lucide-react'

const BATCH = 3

function makeSlot() {
  return { caseCount: '', weight: '', marketId: null, marketQuery: '' }
}

function SlotCard({ slot, idx, markets, onChange, errors }) {
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
          label="Kasa"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="0"
          value={slot.caseCount}
          onChange={(e) => onChange('caseCount', e.target.value.replace(/\D/g, ''))}
          error={errors?.caseCount}
        />
        <Input
          label="Kilo (kg)"
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={slot.weight}
          onChange={(e) => {
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
  const [slots, setSlots] = useState(() => Array.from({ length: BATCH }, makeSlot))
  const [slotErrors, setSlotErrors] = useState([])
  const [loading, setLoading] = useState(false)
  const [confirmFinishProducer, setConfirmFinishProducer] = useState(false)
  const [weak, setWeak] = useState(false)

  useEffect(() => {
    api.getMarkets().then(setMarkets).catch(() => {})
  }, [])

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

  function updateSlot(idx, field, value) {
    setSlots((prev) => {
      const next = prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))

      // Son batch tamamlandıysa 3 yeni slot ekle
      const lastBatchStart = next.length - BATCH
      const lastBatch = next.slice(lastBatchStart)
      if (lastBatch.every((s) => s.caseCount && s.weight && s.marketId)) {
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

  const filledSlots = slots.filter((s) => s.caseCount || s.weight || s.marketId)
  const readySlots = slots.filter((s) => s.caseCount && s.weight && s.marketId)

  function validate() {
    if (!filledSlots.length) {
      addToast('En az bir giriş doldurun', 'error')
      return false
    }
    const errs = Array.from({ length: slots.length }, () => ({}))
    let hasErr = false
    slots.forEach((s, i) => {
      if (!s.caseCount && !s.weight && !s.marketId) return
      if (!s.caseCount || Number(s.caseCount) < 1) { errs[i].caseCount = 'En az 1 kasa'; hasErr = true }
      if (!s.weight || Number(s.weight) <= 0) { errs[i].weight = 'Geçerli kilo gir'; hasErr = true }
      if (!s.marketId) { errs[i].market = 'Pazar seçilmeli'; hasErr = true }
    })
    if (hasErr) { setSlotErrors(errs); return false }
    return true
  }

  async function persistEntries() {
    await api.createEntryBatch({
      vehicleSessionId: activeSession.id,
      productId: selectedProduct.id,
      producerId: selectedProducer?.id,
      weak,
      entries: readySlots.map((s) => ({
        caseCount: Number(s.caseCount),
        weight: Number(s.weight),
        marketId: s.marketId,
      })),
    })
  }

  async function handleSaveAndContinueProduct(e) {
    e?.preventDefault()
    if (!validate()) return
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

  async function handleSaveAndFinishProducer() {
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
