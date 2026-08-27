import { useMemo, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { formatTL, parseAmount } from '@/utils/currency'
import { today } from '@/utils/formatters'
import { X } from 'lucide-react'
import { PAYMENT_METHODS } from './constants'

const MODLAR = [
  { value: 'CLOSE', label: 'Bakiyeleri Kapat' },
  { value: 'FIXED', label: 'Herkese Sabit Tutar' },
  { value: 'SPLIT', label: 'Toplam Tutarı Dağıt' },
]

const yuvarla = (v) => Math.round(v * 100) / 100

// Toplu ödeme.
//
// TEK POST atılıyor (api.createProducerPaymentBatch): frontend'de döngüyle N
// ayrı istek atılsaydı 12 ödemenin 7'si yazılıp 5'i patladığında muhasebede
// telafisi olmayan yarım kayıt kalırdı. Backend tek transaction + clientId ile
// idempotent.
export function BulkPaymentModal({ producers, onClose, onSaved }) {
  const [mode, setMode] = useState('CLOSE')
  const [fixed, setFixed] = useState('')
  const [splitTotal, setSplitTotal] = useState('')
  const [method, setMethod] = useState('CASH')
  const [occurredAt, setOccurredAt] = useState(today())
  const [note, setNote] = useState('')
  const [manuel, setManuel] = useState({})       // id -> elle girilen tutar metni
  const [cikarilan, setCikarilan] = useState(new Set())
  const [saving, setSaving] = useState(false)
  // clientId modal AÇILIŞINDA sabitleniyor: kullanıcı "Kaydet"e iki kez basarsa
  // ikinci istek aynı anahtarla gider ve backend onu yazmaz.
  const [clientId] = useState(() => `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  const addToast = useToastStore((s) => s.addToast)

  const aktifler = useMemo(() => producers.filter((p) => !cikarilan.has(p.id)), [producers, cikarilan])

  // Dağıtım hesabı. Elle düzenlenen satır her modda öncelikli — kullanıcı
  // otomatik dağıtımı gördükten sonra tek satırı değiştirebilmeli.
  const rows = useMemo(() => {
    const sabit = parseAmount(fixed)
    const toplam = parseAmount(splitTotal)
    const bakiyeToplam = aktifler.reduce((s, p) => s + Math.max(0, p.balance), 0)

    // SPLIT: bakiye oranında paylaştır. Her satır ayrı yuvarlandığı için toplam
    // hedeften birkaç kuruş sapar; ARTIK EN BÜYÜK BAKİYELİ SATIRA ekleniyor.
    // Deterministik olmalı — "son satıra ekle" deseydik sıralama değişince
    // aynı girdi farklı sonuç üretirdi.
    let enBuyukId = null, enBuyuk = -Infinity
    for (const p of aktifler) if (p.balance > enBuyuk) { enBuyuk = p.balance; enBuyukId = p.id }

    const otomatik = new Map()
    if (mode === 'SPLIT' && toplam && bakiyeToplam > 0) {
      let dagitilan = 0
      for (const p of aktifler) {
        const v = yuvarla((Math.max(0, p.balance) / bakiyeToplam) * toplam)
        otomatik.set(p.id, v)
        dagitilan = yuvarla(dagitilan + v)
      }
      const artik = yuvarla(toplam - dagitilan)
      if (artik !== 0 && enBuyukId != null) {
        otomatik.set(enBuyukId, yuvarla(otomatik.get(enBuyukId) + artik))
      }
    }

    return aktifler.map((p) => {
      let auto = 0
      if (mode === 'CLOSE') auto = Math.max(0, p.balance)
      else if (mode === 'FIXED') auto = sabit ?? 0
      else if (mode === 'SPLIT') auto = otomatik.get(p.id) ?? 0
      const elle = manuel[p.id]
      const amount = elle !== undefined && elle !== '' ? (parseAmount(elle) ?? 0) : auto
      return { ...p, auto, amountStr: elle !== undefined ? elle : (auto ? String(auto) : ''), amount }
    })
  }, [aktifler, mode, fixed, splitTotal, manuel])

  const girilenToplam = yuvarla(rows.reduce((s, r) => s + (r.amount || 0), 0))
  const hedefToplam = parseAmount(splitTotal)
  const sapma = mode === 'SPLIT' && hedefToplam ? yuvarla(girilenToplam - hedefToplam) : 0
  const gecerli = rows.filter((r) => r.amount > 0)

  async function save() {
    if (!gecerli.length) return addToast('En az bir satırda tutar olmalı', 'error')
    setSaving(true)
    try {
      const res = await api.createProducerPaymentBatch({
        clientId, paymentMethod: method, occurredAt, note: note.trim() || null,
        rows: gecerli.map((r) => ({ producerId: r.id, amount: r.amount })),
      })
      if (res.alreadySynced) {
        addToast('Bu ödeme partisi zaten kaydedilmişti')
      } else {
        addToast(`${res.count} üreticiye toplam ${formatTL(res.totalAmount)} ödendi ✓`)
      }
      onSaved(res.receipts ?? [])
    } catch (e) {
      addToast(e?.response?.data?.error ?? 'Toplu ödeme kaydedilemedi', 'error')
    } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Toplu Ödeme — ${aktifler.length} üretici`} className="max-w-3xl">
      <div className="flex flex-col gap-4">
        <Segmented value={mode} onChange={setMode} options={MODLAR} />

        {mode === 'FIXED' && (
          <Input label="Kişi Başı Tutar (₺)" type="text" inputMode="decimal" placeholder="0,00"
            value={fixed} onChange={(e) => setFixed(e.target.value)} />
        )}
        {mode === 'SPLIT' && (
          <Input label="Dağıtılacak Toplam (₺)" type="text" inputMode="decimal" placeholder="0,00"
            value={splitTotal} onChange={(e) => setSplitTotal(e.target.value)} />
        )}

        <div className="max-h-72 overflow-y-auto border border-border rounded-xl divide-y divide-border">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1 text-sm truncate" title={r.name}>{r.name}</span>
              <span className="text-xs text-text-muted tabular-nums w-28 text-right" title="Kalan bakiye">
                {formatTL(r.balance)}
              </span>
              <input
                type="text" inputMode="decimal" value={r.amountStr}
                onChange={(e) => setManuel((m) => ({ ...m, [r.id]: e.target.value }))}
                className="w-32 px-3 py-1.5 rounded-lg border border-border text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button type="button" onClick={() => setCikarilan((s) => new Set([...s, r.id]))}
                className="p-1.5 rounded-lg hover:bg-red-50 text-error" title="Bu satırı çıkar">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 font-semibold">
          <span className="text-sm">{gecerli.length} üretici · Toplam</span>
          <span className="tabular-nums">{formatTL(girilenToplam)}</span>
        </div>

        {Math.abs(sapma) > 0.01 && (
          <p className="text-sm text-error">
            Girilen toplam ({formatTL(girilenToplam)}) dağıtılacak tutardan ({formatTL(hedefToplam)})
            {' '}<strong>{formatTL(Math.abs(sapma))}</strong> {sapma > 0 ? 'fazla' : 'eksik'}.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Segmented label="Ödeme Yöntemi" value={method} onChange={setMethod} options={PAYMENT_METHODS} size="sm" />
          <Input label="Tarih" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </div>

        <Input label="Ortak Açıklama" value={note} onChange={(e) => setNote(e.target.value)} placeholder="İsteğe bağlı…" />

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
          <Button onClick={save} loading={saving} disabled={!gecerli.length}>
            {formatTL(girilenToplam)} Öde
          </Button>
        </div>
      </div>
    </Modal>
  )
}
