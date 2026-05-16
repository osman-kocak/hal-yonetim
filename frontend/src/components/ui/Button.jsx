import { cn } from '@/utils/cn'
import { LoadingSpinner } from './LoadingSpinner'

const variants = {
  primary: 'bg-primary text-white hover:bg-primary-dark active:bg-primary-dark',
  danger: 'bg-error text-white hover:bg-red-700 active:bg-red-800',
  outline: 'border border-border text-text-primary hover:bg-gray-50 active:bg-gray-100',
  ghost: 'text-text-secondary hover:bg-gray-100 active:bg-gray-200',
  success: 'bg-green-600 text-white hover:bg-green-700',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-base',
  xl: 'px-6 py-4 text-lg font-semibold',
}

export function Button({ variant = 'primary', size = 'md', loading, disabled, className, children, ...props }) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && <LoadingSpinner size="sm" />}
      {children}
    </button>
  )
}
