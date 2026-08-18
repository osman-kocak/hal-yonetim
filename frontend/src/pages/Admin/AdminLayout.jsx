import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { hasAnyRole } from '@/utils/roles'
import { cn } from '@/utils/cn'
import {
  LayoutDashboard, MapPin, Package, Store, BarChart2, LogOut, DollarSign, History, UserCog, User, Boxes, ArrowLeftRight, Wallet, RotateCcw, Home, Trash, ShieldAlert, ArrowLeft, Warehouse, WifiOff
} from 'lucide-react'

const nav = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/fiyatlar', label: 'Günlük Fiyatlar', icon: DollarSign },
  { to: '/admin/finans', label: 'Finans', icon: Wallet },
  { to: '/admin/takip', label: 'Takip & Geçmiş', icon: History },
  { to: '/admin/depo', label: 'Depo', icon: Warehouse },
  { to: '/admin/kasalar', label: 'Kasa Takip', icon: Boxes },
  { to: '/admin/transferler', label: 'Transferler', icon: ArrowLeftRight },
  { to: '/admin/iadeler', label: 'İadeler', icon: RotateCcw },
  { to: '/admin/fire', label: 'Fire / İmha', icon: Trash },
  { to: '/admin/raporlar', label: 'Raporlar', icon: BarChart2 },
  { to: '/admin/kullanicilar', label: 'Kullanıcılar', icon: UserCog, adminOnly: true },
  { to: '/admin/erisim-kayitlari', label: 'Erişim Kayıtları', icon: ShieldAlert, adminOnly: true },
  // Saha kesinti ölçümü (Faz 0) — offline yatırım kararının dayanağı.
  // ACCOUNTING de görebilir: kesinti süresi operasyonel bir maliyet.
  { to: '/admin/kesintiler', label: 'Kesintiler', icon: WifiOff },
  { to: '/admin/bolgeler', label: 'Bölgeler', icon: MapPin },
  { to: '/admin/ureticiler', label: 'Üreticiler', icon: User },
  { to: '/admin/urunler', label: 'Ürünler', icon: Package },
  { to: '/admin/pazarlar', label: 'Pazarlar', icon: Store },
  // Kaliteler menüden kaldırıldı (2026-08-13): kalite özelliği kullanılmıyor,
  // fiyat ürün başına tek. Route duruyor — geçmiş kayıtlardaki kalite adlarını
  // düzeltmek gerekirse /admin/kaliteler adresinden hâlâ açılabilir.
]

export function AdminLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  // Auth + role kontrolü ProtectedRoute tarafından yapılır.
  // ADMIN-only menüler (kullanıcılar, erişim kayıtları) ACCOUNTING'e gizlenir.
  const isAdmin = hasAnyRole(user, 'ADMIN')

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Sidebar */}
      {/* h-screen + sticky: menü 16 öğeye çıkınca aside ekranı aşıyor ve alttaki
          "Ana Sayfaya Dön" / "Çıkış" ekranın dışına itiliyordu. */}
      <aside className="w-56 bg-white border-r border-border flex flex-col shrink-0 h-screen sticky top-0">
        {/* Geri oku başlıkta: menünün DİBİNDEKİ "Ana Sayfaya Dön" uzun listede
            gözden kaçıyor. Diğer panellerle (Depo, Kasacı, İade) aynı desen. */}
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/')}
              className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 text-text-muted shrink-0"
              title="Ana sayfaya dön"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-xs text-text-muted">HAL YÖNETİM</p>
              <h2 className="font-bold text-text-primary">Admin Paneli</h2>
            </div>
          </div>
          {user && (
            <p className="text-xs text-text-muted mt-2 truncate">{user.name} ({user.username})</p>
          )}
        </div>
        {/* min-h-0: flex çocuğu varsayılan olarak küçülmez, overflow tetiklenmez */}
        <nav className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-1">
          {nav.filter((item) => !item.adminOnly || isAdmin).map(({ to, label, icon: Icon, end }) => (
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
        <div className="p-3 border-t border-border flex flex-col gap-1">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-text-secondary hover:bg-gray-50 hover:text-text-primary w-full transition-colors"
          >
            <Home className="w-4 h-4" />
            Ana Sayfaya Dön
          </button>
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
