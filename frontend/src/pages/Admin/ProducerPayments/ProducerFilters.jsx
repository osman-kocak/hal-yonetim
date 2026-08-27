import { Button } from '@/components/ui/Button'
import { today } from '@/utils/formatters'
import { cn } from '@/utils/cn'
import { X } from 'lucide-react'

const HIZLI = [
  { key: 'today', label: 'Bugün' },
  { key: 'week', label: 'Bu Hafta' },
  { key: 'month', label: 'Bu Ay' },
  { key: 'all', label: 'Tümü' },
]

function araligiHesapla(key) {
  const now = new Date()
  const g = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (key === 'today') return { dateFrom: today(), dateTo: today() }
  if (key === 'week') {
    const d = new Date(now)
    // Pazartesi başlangıç (TR): getDay() pazar=0, onu 7 say
    d.setDate(d.getDate() - ((d.getDay() || 7) - 1))
    return { dateFrom: g(d), dateTo: today() }
  }
  if (key === 'month') return { dateFrom: g(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: today() }
  return { dateFrom: '', dateTo: '' }
}

const ESIKLER = [1000, 5000, 10000]

export function ProducerFilters({ filters, setFilters, regions, resultCount }) {
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }))
  const aktif = filters.q || filters.regionId || filters.dateFrom || filters.dateTo
    || filters.minBalance || !filters.onlyDebt || filters.includeInactive

  return (
    <div className="bg-white border border-border rounded-2xl p-4 shadow-card mb-4 flex flex-col gap-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Üretici</label>
          <input
            value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Ad ara…"
            className="px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Bölge</label>
          <select
            value={filters.regionId} onChange={(e) => set({ regionId: e.target.value })}
            className="px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Tüm bölgeler</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Başlangıç</label>
          <input type="date" value={filters.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })}
            className="px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Bitiş</label>
          <input type="date" value={filters.dateTo} onChange={(e) => set({ dateTo: e.target.value })}
            className="px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="flex gap-1">
          {HIZLI.map((h) => (
            <button key={h.key} type="button" onClick={() => set(araligiHesapla(h.key))}
              className="px-2.5 py-2 rounded-lg border border-border text-xs text-text-secondary hover:bg-gray-50">
              {h.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input type="checkbox" checked={filters.onlyDebt} onChange={(e) => set({ onlyDebt: e.target.checked })}
            className="w-4 h-4 rounded accent-primary" />
          Sadece bakiyesi olanlar
        </label>
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input type="checkbox" checked={filters.includeInactive} onChange={(e) => set({ includeInactive: e.target.checked })}
            className="w-4 h-4 rounded accent-primary" />
          Pasif üreticileri de göster
          {/* Not: pasif üretici gizliyken bile BAKİYESİ OLAN pasif üretici
              listede kalır (backend kuralı) — borçlu birini gizlemek para
              kaybettirir, satırda "Pasif" rozeti çıkar. */}
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">Min. bakiye</span>
          <input
            inputMode="decimal" value={filters.minBalance} onChange={(e) => set({ minBalance: e.target.value })}
            placeholder="0" className="w-24 px-3 py-1.5 rounded-lg border border-border text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {ESIKLER.map((e) => (
            <button key={e} type="button" onClick={() => set({ minBalance: String(e) })}
              className={cn('px-2 py-1 rounded-lg border text-xs',
                String(e) === filters.minBalance ? 'border-primary bg-primary-light text-primary-dark' : 'border-border text-text-muted hover:bg-gray-50')}>
              {e.toLocaleString('tr-TR')}
            </button>
          ))}
        </div>
        <span className="text-sm text-text-muted ml-auto">{resultCount} üretici</span>
        {aktif && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({
            regionId: '', q: '', dateFrom: '', dateTo: '', onlyDebt: true, minBalance: '', includeInactive: false,
          })}>
            <X className="w-4 h-4" /> Filtreleri temizle
          </Button>
        )}
      </div>
    </div>
  )
}
