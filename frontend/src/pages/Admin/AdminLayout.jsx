import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/utils/cn'
import {
  LayoutDashboard, Users, Package, Store, Star, BarChart2, LogOut, DollarSign, History, UserCog, User, Boxes, ArrowLeftRight, Wallet
} from 'lucide-react'

const nav = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/fiyatlar', label: 'Günlük Fiyatlar', icon: DollarSign },
  { to: '/admin/finans', label: 'Finans', icon: Wallet },
  { to: '/admin/takip', label: 'Takip & Geçmiş', icon: History },
  { to: '/admin/kasalar', label: 'Kasa Takip', icon: Boxes },
  { to: '/admin/transferler', label: 'Transferler', icon: ArrowLeftRight },
  { to: '/admin/raporlar', label: 'Raporlar', icon: BarChart2 },
  { to: '/admin/kullanicilar', label: 'Kullanıcılar', icon: UserCog },
  { to: '/admin/soforler', label: 'Şoförler', icon: Users },
  { to: '/admin/ureticiler', label: 'Üreticiler', icon: User },
  { to: '/admin/urunler', label: 'Ürünler', icon: Package },
  { to: '/admin/pazarlar', label: 'Pazarlar', icon: Store },
  { to: '/admin/kaliteler', label: 'Kaliteler', icon: Star },
]

export function AdminLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  // Auth + role kontrolü ProtectedRoute tarafından yapılır

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-border flex flex-col shrink-0">
        <div className="p-5 border-b border-border">
          <p className="text-xs text-text-muted">HAL YÖNETİM</p>
          <h2 className="font-bold text-text-primary">Admin Paneli</h2>
          {user && (
            <p className="text-xs text-text-muted mt-1 truncate">{user.name} ({user.username})</p>
          )}
        </div>
        <nav className="flex-1 p-3 flex flex-col gap-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-light text-primary-dark'
                    : 'text-text-secondary hover:bg-gray-50 hover:text-text-primary'
                )
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <button
            onClick={() => { logout(); navigate('/giris') }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-error hover:bg-red-50 w-full transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Çıkış Yap
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
