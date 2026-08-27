import { useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { formatTL, parseAmount } from '@/utils/currency'
import { today } from '@/utils/formatters'
import { printReceipt } from '@/store/printStore'
import { PAYMENT_METHODS } from './constants'

// Tek üreticiye ödeme.
//
// +/− YÖN BUTONU YOK (FinancePage'deki LedgerModal'ın aksine): bu ekranda tek
// yön var — para çıkıyor. Düzeltme/borç girişi Finans sayfasında kalıyor.
// Buraya yön butonu koymak yalnızca yanlışlıkla borç yazma yolu açardı.
export function PaymentModal({ producer, onClose, onSaved }) {
  const [amountStr, setAmountStr] = useState('')
  const [method, setMethod] = useState('CASH')
  const [reference, setReference] = useState('')
  const [chequeDue, setChequeDue] = useState('')
  const [occurredAt, setOccurredAt] = useState(today())
  const [note, setNote] = useState('')
  const [printAfter, setPrintAfter] = useState(true)
  const [saving, setSaving] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const amount = parseAmount(amountStr)
  const bakiye = producer.balance ?? 0
  // Fazla ödeme ENGELLENMEZ, uyarılır: avans gerçek bir senaryo ve bakiye
  // eksiye düşünce panelde "avans" olarak görünüyor.
  const fazla = amount != null && amount > bakiye && bakiye > 0

  async function save() {
    if (amount == null || amount <= 0) return addToast('Tutar sıfırdan büyük olmalı', 'error')
    setSaving(true)
    try {
      const notlar = [note.trim(), method === 'CHECK' && chequeDue ? `Vade: ${chequeDue}` : null].filter(Boolean).join(' · ')
      const saved = await api.createProducerPayment(producer.id, {
        amount, paymentMethod: method, occurredAt,
        note: notlar || null, reference: reference.trim() || null,
      })
      addToast(`${producer.name} · ${formatTL(amount)} ödendi ✓`)
      // Makbuz bakiyeleri BACKEND'den geliyor (balanceBefore/After): modal
      // açıldığı andaki bakiye kayıt anındakinden farklı olabilir, frontend'de
      // hesaplamak yanlış makbuz basar.
      if (printAfter) {
        printReceipt({
          kind: 'producer-payment',
          producerName: saved.producer?.name ?? producer.name,
          regionName: saved.producer?.regionName ?? producer.regionName,
          amount: saved.amount,
          method, reference: reference.trim(),
          occurredAt: saved.occurredAt,
          balanceBefore: saved.balanceBefore,
          balanceAfter: saved.balanceAfter,
          receiptNo: saved.id,
          createdBy: saved.createdBy,
          note: notlar,
        })
      }
      onSaved()
    } catch (e) {
      addToast(e?.response?.data?.error ?? 'Ödeme kaydedilemedi', 'error')
    } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={`${producer.name} — Ödeme`}>
      <div className="flex flex-col gap-4">
        {/* Bakiye şeridi: tutar bağlamsız girilmesin */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
          <span className="text-sm text-amber-900">Kalan bakiye</span>
          <span className="text-lg font-bold text-amber-900 tabular-nums">{formatTL(bakiye)}</span>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <Input
            label="Ödeme Tutarı (₺)" type="text" inputMode="decimal" placeholder="0,00"
            value={amountStr} onChange={(e) => setAmountStr(e.target.value)}
          />
          <Button variant="outline" size="lg" onClick={() => setAmountStr(String(bakiye))} disabled={bakiye <= 0}>
            Bakiyeyi Kapat
          </Button>
        </div>

        <Segmented label="Ödeme Yöntemi" value={method} onChange={setMethod} options={PAYMENT_METHODS} />

        {method === 'TRANSFER' && (
          <Input label="Havale / IBAN Referansı" value={reference} onChange={(e) => setReference(e.target.value)}
            placeholder="Dekont no veya IBAN son 4 hane" />
        )}
        {method === 'CHECK' && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Çek No" value={reference} onChange={(e) => setReference(e.target.value)} />
            <Input label="Vade Tarihi" type="date" value={chequeDue} onChange={(e) => setChequeDue(e.target.value)} />
          </div>
        )}

        <Input label="Tarih" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-text-secondary">Açıklama</label>
          <textarea
            value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="İsteğe bağlı…"
            className="w-full px-4 py-3 rounded-xl border border-border bg-white text-text-primary text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>

        {fazla && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Girilen tutar bakiyeden <strong>{formatTL(amount - bakiye)}</strong> fazla —
            aradaki fark üretici <strong>avansı</strong> olarak kaydedilecek.
          </p>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={printAfter} onChange={(e) => setPrintAfter(e.target.checked)}
            className="w-4 h-4 rounded accent-primary" />
          <span className="text-sm text-text-secondary">Kaydettikten sonra makbuz yazdır</span>
        </label>

        <div className="flex gap-3 justify-end pt-1">
          <Button variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
          <Button onClick={save} loading={saving} disabled={amount == null || amount <= 0}>
            {amount != null && amount > 0 ? `${formatTL(amount)} Öde` : 'Öde'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
