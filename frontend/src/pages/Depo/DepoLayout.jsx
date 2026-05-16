import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { hasAnyRole, formatRoles } from '@/utils/roles'
import { Boxes, LogOut, ArrowLeft } from 'lucide-react'

export function DepoLayout() {
  const { isAuthenticated, user, logout } = useAuthStore()
  const navigate = useNavigate()

  if (!isAuthenticated) return <Navigate to="/depo/giris" replace />
  if (user && !hasAnyRole(user, 'DEPO', 'ADMIN')) {
    return <Navigate to="/depo/giris" replace />
  }

  function handleLogout() {
    logout()
    navigate('/depo/giris')
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg hover:bg-gray-100 text-text-muted shrink-0"
            title="Ana sayfaya dön"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-2xl shrink-0">📦</span>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-text-primary leading-none">DEPO PANELİ</h1>
            {user && (
              <p className="text-xs text-text-muted mt-1 truncate">
                {user.name} ({user.username}) · {formatRoles(user)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-error hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Çıkış</span>
          </button>
        </div>
      </header>
      <main className="p-4 sm:p-6 max-w-6xl mx-auto">
        <Outlet />
      </main>
    </div>
  )
}
