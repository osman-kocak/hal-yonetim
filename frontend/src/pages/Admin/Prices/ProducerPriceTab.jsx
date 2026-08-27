import { useEffect, useMemo, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { formatTL, formatPct } from '@/utils/currency'
import { priceLabel } from '@/utils/formatters'
import { cn } from '@/utils/cn'
import { X, Search, Percent, User } from 'lucide-react'
import { shortDate } from './usePriceCells'

// Üretici bazlı ÖZEL alış fiyatı.
//
// Bu sekmenin varlık sebebi "Etkin Fiyat" kolonu: üç katmanlı çözümü CANLI
// gösterir. Kullanıcı hangi fiyatın geçerli olacağını tahmin etmez, görür.
// Rozetler ödeme paneliyle AYNI dili konuşur (Özel fiyat / +%5 prim / Genel).
export function ProducerPriceTab({ date, products }) {
  const [producers, setProducers] = useState([])
  const [selected, setSelected] = useState(null)
  const [rows, setRows] = useState({})           // productId -> { id, value, original, inherited, from, cancelled }
  const [general, setGeneral] = useState({})     // productId -> genel alış fiyatı
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [query, setQuery] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const [onlySpecial, setOnlySpecial] = useState(false)
  const [premiumOpen, setPremiumOpen] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    Promise.all([api.getAdminProducers(), api.getPurchasePrices(date)])
      .then(([prs, gen]) => {
        setProducers(prs)
        const g = {}
        for (const p of gen) g[p.productId] = { price: p.pricePerKg, inherited: p.inherited, from: p.date }
        setGeneral(g)
      })
      .finally(() => setLoading(false))
  }, [date])

  useEffect(() => {
    if (!selected) return setRows({})
    api.getProducerPrices(selected.id, date).then((list) => {
      const m = {}
      for (const p of list) {
        m[p.productId] = {
          id: p.id, value: p.cancelled ? '' : String(p.pricePerKg),
          original: p.cancelled ? '' : String(p.pricePerKg),
          inherited: p.inherited, from: p.date, cancelled: p.cancelled,
        }
      }
      setRows(m)
    })
  }, [selected, date])

  async function saveCell(productId) {
    const cell = rows[productId]
    const raw = cell?.value
    if (raw === cell?.original) return    // değişmediyse yazma (fiyat geçmişi şişmesin)
    setSaving(productId)
    try {
      if (raw === '' || raw === undefined) {
        // Boşaltma = özel fiyatı KALDIR. Satır silinmiyor, cancelled=true mezar
        // taşı bırakılıyor — silinseydi carry-forward bir önceki özel fiyatı
        // diriltir ve "kaldırdım" denen rakam kendiliğinden geri gelirdi.
        if (cell?.id) {
          await api.cancelProducerPrice(cell.id, date)
          setRows((p) => ({ ...p, [productId]: { ...p[productId], value: '', original: '', cancelled: true, inherited: false } }))
          addToast('Özel fiyat kaldırıldı')
        }
        return
      }
      const pricePerKg = parseFloat(raw)
      if (isNaN(pricePerKg) || pricePerKg < 0) return
      const saved = await api.upsertProducerPrice({ producerId: selected.id, productId, pricePerKg, date })
      setRows((p) => ({
        ...p,
        [productId]: { id: saved.id, value: raw, original: raw, inherited: false, from: saved.date, cancelled: false },
      }))
    } catch {
      addToast('Özel fiyat kaydedilemedi', 'error')
    } finally {
      setSaving(null)
    }
  }

  const filteredProducers = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? producers.filter((p) => p.name.toLowerCase().includes(q)) : producers
  }, [producers, query])

  const visibleProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    let list = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products
    if (onlySpecial) list = list.filter((p) => rows[p.id] && !rows[p.id].cancelled && rows[p.id].value !== '')
    return list
  }, [products, productQuery, onlySpecial, rows])

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" className="text-primary" /></div>

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
      {/* Sol: üretici seçici */}
      <div className="bg-white border border-border rounded-2xl shadow-card overflow-hidden flex flex-col max-h-[70vh]">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Üretici ara…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
        <div className="overflow-y-auto divide-y divide-border">
          {filteredProducers.map((p) => (
            <button
              key={p.id} type="button" onClick={() => setSelected(p)}
              className={cn('w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors flex items-center justify-between gap-2',
                selected?.id === p.id && 'bg-primary-light')}
            >
              <span className={cn('text-sm truncate', !p.active && 'text-text-muted')}>{p.name}</span>
              {p.pricePremiumPct ? (
                <span className="text-[10px] font-semibold text-amber-700 shrink-0">{formatPct(p.pricePremiumPct)}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Sağ: ürün × fiyat matrisi */}
      {!selected ? (
        <EmptyState icon={User} title="Üretici seçin"
          description="Soldaki listeden bir üretici seçince o üreticiye özel alış fiyatlarını girebilirsiniz." />
      ) : (
        <div className="flex flex-col gap-3 min-w-0">
          <div className="bg-white border border-border rounded-2xl p-4 shadow-card flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-bold text-text-primary">{selected.name}</h2>
              <p className="text-xs text-text-muted mt-0.5">
                Alış primi: <strong className="text-text-secondary">{formatPct(selected.pricePremiumPct)}</strong>
                {' · '}Özel fiyat tanımlı ürünlerde prim UYGULANMAZ
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPremiumOpen(true)}>
              <Percent className="w-4 h-4" /> Primi Düzenle
            </Button>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <input
              value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Ürün ara…"
              className="px-4 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input type="checkbox" checked={onlySpecial} onChange={(e) => setOnlySpecial(e.target.checked)}
                className="w-4 h-4 rounded accent-primary" />
              Sadece özel fiyatı olanlar
            </label>
          </div>

          <div className="bg-white border border-border rounded-2xl shadow-card overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Ürün</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-muted">Genel</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-muted">Primli</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">Özel</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-primary">Etkin Fiyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleProducts.map((p) => {
                  const gen = general[p.id]?.price
                  const pct = Number(selected.pricePremiumPct ?? 0)
                  const primli = gen != null && pct !== 0 ? Math.round(gen * (1 + pct / 100) * 100) / 100 : null
                  const cell = rows[p.id]
                  const ozel = cell && !cell.cancelled && cell.value !== '' ? Number(cell.value) : null

                  // ÜÇ KATMANLI ÇÖZÜM — backend utils/purchasePrices.js ile
                  // BİREBİR aynı sıra. Buradaki mantık orayla ayrışırsa ekran
                  // bir fiyat gösterip sistem başkasını yazar.
                  let etkin = null, rozet, variant
                  if (ozel != null) { etkin = ozel; rozet = 'Özel fiyat'; variant = 'quality-a' }
                  else if (primli != null) { etkin = primli; rozet = formatPct(pct) + ' prim'; variant = 'warning' }
                  else if (gen != null) { etkin = gen; rozet = 'Genel'; variant = 'default' }
                  else { rozet = 'Fiyatsız'; variant = 'error' }

                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-2 sm:p-3 font-medium text-text-primary">
                        <div className="flex items-center gap-2">
                          <span>{p.icon || '📦'}</span>
                          <div className="flex flex-col">
                            <span>{p.name}</span>
                            <span className="text-[10px] text-text-muted">{priceLabel(p.unit)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-2 sm:p-3 text-right tabular-nums text-text-muted">
                        {gen != null ? formatTL(gen) : '—'}
                      </td>
                      <td className="p-2 sm:p-3 text-right tabular-nums text-text-muted">
                        {primli != null ? formatTL(primli) : '—'}
                      </td>
                      <td className="p-2 sm:p-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <div className="relative inline-flex items-center">
                            <span className="absolute left-2 text-text-muted text-xs">₺</span>
                            <input
                              type="number" step="0.01" min="0" placeholder="—"
                              value={cell?.value ?? ''}
                              onChange={(e) => setRows((prev) => ({ ...prev, [p.id]: { ...prev[p.id], value: e.target.value } }))}
                              onBlur={() => saveCell(p.id)}
                              className="w-24 pl-6 pr-2 py-1.5 rounded-lg border border-border text-right text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            {saving === p.id && (
                              <span className="absolute -right-5"><LoadingSpinner size="sm" className="text-primary" /></span>
                            )}
                          </div>
                          {ozel != null && (
                            <button type="button" title="Özel fiyatı kaldır"
                              onClick={() => { setRows((prev) => ({ ...prev, [p.id]: { ...prev[p.id], value: '' } })); saveCell(p.id) }}
                              className="p-1 rounded-lg hover:bg-red-50 text-error">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        {cell?.inherited && !cell.cancelled && cell.value !== '' && (
                          <div className="text-[10px] text-text-muted pr-1">{shortDate(cell.from)}'tan devir</div>
                        )}
                      </td>
                      <td className="p-2 sm:p-3 text-right">
                        <div className="inline-flex flex-col items-end gap-0.5">
                          <span className={cn('font-bold tabular-nums', etkin == null && 'text-error')}>
                            {etkin != null ? formatTL(etkin) : '—'}
                          </span>
                          <Badge variant={variant}>{rozet}</Badge>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {premiumOpen && (
        <PremiumModal
          producer={selected}
          onClose={() => setPremiumOpen(false)}
          onSaved={(pct) => {
            setSelected((s) => ({ ...s, pricePremiumPct: pct }))
            setProducers((list) => list.map((p) => p.id === selected.id ? { ...p, pricePremiumPct: pct } : p))
            setPremiumOpen(false)
          }}
        />
      )}
    </div>
  )
}

// Primi buradan düzenlemek akışı bölmüyor: kullanıcı zaten fiyat kurgulamakla
// meşgul, Üreticiler sayfasına gidip geri dönmesi gereksiz.
function PremiumModal({ producer, onClose, onSaved }) {
  const [value, setValue] = useState(String(producer.pricePremiumPct ?? 0))
  const [saving, setSaving] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  async function save() {
    const pct = value === '' ? 0 : Number(value)
    if (!Number.isFinite(pct) || pct <= -100 || pct > 100) {
      return addToast('Prim -100 ile 100 arasında olmalı', 'error')
    }
    setSaving(true)
    try {
      await api.updateProducer(producer.id, { pricePremiumPct: pct })
      addToast('Prim güncellendi ✓')
      onSaved(pct)
    } catch {
      addToast('Prim kaydedilemedi', 'error')
    } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={`${producer.name} — Alış Primi`}>
      <div className="flex flex-col gap-4">
        <Input
          label="Prim / İskonto (%)" type="number" step="0.1" min="-99.9" max="100"
          value={value} onChange={(e) => setValue(e.target.value)} placeholder="0"
        />
        <p className="text-xs text-text-muted">
          Genel alış fiyatı üzerinden uygulanır. <strong>+5</strong> → %5 fazla öde,
          {' '}<strong>−3</strong> → %3 eksik öde, <strong>0</strong> → sapma yok.
          {' '}Bir üründe özel fiyat tanımlıysa <strong className="text-text-secondary">o üründe prim uygulanmaz</strong>.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
          <Button onClick={save} loading={saving}>Kaydet</Button>
        </div>
      </div>
    </Modal>
  )
}
