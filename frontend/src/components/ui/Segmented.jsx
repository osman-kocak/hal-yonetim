import { cn } from '@/utils/cn'

// Sekme/seçim şeridi. Kod tabanındaki `flex gap-1 bg-gray-100 p-1 rounded-xl`
// + aktifte `bg-white shadow-card` deseninin ortaklaştırılmış hâli — dördüncü
// kopyadan önce çıkarıldı (FinancePage yön butonu, CaseTracking sekmesi,
// üretici ödeme panelinde üç ayrı yer).
export function Segmented({ label, value, onChange, options, className, size = 'md' }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-text-secondary">{label}</label>}
      <div className={cn('flex gap-1 bg-gray-100 p-1 rounded-xl', className)}>
        {options.map((o) => {
          const Icon = o.icon
          const active = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all',
                size === 'sm' ? 'py-1.5 px-2 text-xs' : 'py-2 px-3 text-sm',
                active ? 'bg-white text-text-primary shadow-card' : 'text-text-muted hover:text-text-primary',
              )}
            >
              {Icon && <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />}
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
