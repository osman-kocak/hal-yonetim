import { useToastStore } from '@/store/toastStore'
import { cn } from '@/utils/cn'
import { CheckCircle, XCircle, X } from 'lucide-react'

const icons = {
  success: <CheckCircle className="w-5 h-5 text-success" />,
  error: <XCircle className="w-5 h-5 text-error" />,
}

const styles = {
  success: 'border-l-4 border-success',
  error: 'border-l-4 border-error',
}

export function ToastProvider() {
  const { toasts, removeToast } = useToastStore()

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-start gap-3 bg-white rounded-xl shadow-card-hover p-4',
            styles[t.type]
          )}
        >
          {icons[t.type]}
          <p className="flex-1 text-sm text-text-primary">{t.message}</p>
          <button onClick={() => removeToast(t.id)} className="text-text-muted hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
