import { cn } from '@/utils/cn'

export function Input({ label, error, className, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-text-secondary">{label}</label>}
      <input
        className={cn(
          'w-full px-4 py-3 rounded-xl border border-border bg-white text-text-primary',
          'text-base placeholder:text-text-muted',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
          error && 'border-error focus:ring-error',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}

export function MarketAutocomplete({ label, markets, value, onChange, onSelect, error, inputRef }) {
  function handleChange(e) {
    const v = e.target.value.replace(/\D/g, '')
    onChange?.(v)
    const exact = markets.find((m) => String(m.no) === v)
    onSelect?.(exact ?? null)
  }

  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-text-secondary">{label}</label>}
      <input
        ref={inputRef}
        inputMode="numeric"
        placeholder="0"
        value={value ?? ''}
        onChange={handleChange}
        className={cn(
          'w-full px-4 py-3 rounded-xl border border-border bg-white text-text-primary text-base',
          'placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
          error && 'border-error focus:ring-error'
        )}
      />
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}
