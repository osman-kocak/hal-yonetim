import { cn } from '@/utils/cn'

const variants = {
  default: 'bg-gray-100 text-text-secondary',
  primary: 'bg-primary-light text-primary-dark',
  'quality-a': 'bg-blue-100 text-blue-700',
  'quality-b': 'bg-purple-100 text-purple-700',
  warning: 'bg-amber-100 text-amber-700',
  success: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
}

export function Badge({ variant = 'default', className, children }) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold', variants[variant], className)}>
      {children}
    </span>
  )
}
