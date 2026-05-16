import { cn } from '@/utils/cn'

export function SelectCard({ label, sublabel, icon, selected, onClick, disabled, colorClass }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all',
        'min-h-[120px] w-full font-medium text-center',
        'hover:shadow-card-hover active:scale-95',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        selected
          ? 'border-primary bg-primary-light shadow-card-active text-primary-dark'
          : 'border-border bg-card shadow-card hover:border-primary/40 text-text-primary',
        colorClass
      )}
    >
      {icon && <span className="text-3xl leading-none">{icon}</span>}
      <span className="text-base font-semibold">{label}</span>
      {sublabel && <span className="text-xs text-text-muted">{sublabel}</span>}
    </button>
  )
}

export function DataCard({ className, children }) {
  return (
    <div className={cn('bg-card border border-border rounded-xl shadow-card p-4', className)}>
      {children}
    </div>
  )
}
