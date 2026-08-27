import { Link } from 'react-router-dom'
import { cn } from '@/utils/cn'

// Özet kart. FinancePage'in yerel ReportCard'ından çıkarıldı; ek olarak
// tıklanabilir (to / onClick) — panel kartları filtreyi değiştiriyor.
const TONES = {
  neutral: 'bg-white border-border text-text-primary',
  amber: 'bg-amber-50 border-amber-200 text-amber-900',
  green: 'bg-green-50 border-green-200 text-green-900',
  blue: 'bg-blue-50 border-blue-200 text-blue-900',
  red: 'bg-red-50 border-red-200 text-red-900',
}

export function StatCard({ label, value, sub, icon: Icon, tone = 'neutral', to, onClick, className }) {
  const clickable = Boolean(to || onClick)
  const inner = (
    <>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="w-4 h-4 opacity-70 shrink-0" />}
        <span className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-xs opacity-70 mt-1">{sub}</p>}
    </>
  )
  const cls = cn(
    'border rounded-2xl p-4 shadow-card text-left block',
    TONES[tone] ?? TONES.neutral,
    clickable && 'hover:shadow-card-hover transition-shadow cursor-pointer',
    className,
  )
  if (to) return <Link to={to} className={cls}>{inner}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={cn(cls, 'w-full')}>{inner}</button>
  return <div className={cls}>{inner}</div>
}
