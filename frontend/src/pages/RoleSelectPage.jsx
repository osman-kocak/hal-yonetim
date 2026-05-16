import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { hasAnyRoleArr } from '@/utils/roles'
import { ShoppingBasket, Receipt, Package, Settings, Boxes, LogOut } from 'lucide-react'

const ALL_CARDS = [
  {
    key: 'operator',
    roles: ['OPERATOR', 'ADMIN'],
    icon: ShoppingBasket,
    title: 'Mal Kabul',
    description: 'Halden gelen ürünleri kaydet, sürücü-üretici-kalite seç',
    to: '/mal-kabul',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    key: 'exit',
    roles: ['OPERATOR', 'ADMIN'],
    icon: Receipt,
    title: 'Çıkış / İrsaliye',
    description: 'Pazarlara çıkış kes, irsaliye yazdır',
    to: '/cikis',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    key: 'depo',
    roles: ['DEPO', 'ADMIN'],
    icon: Package,
    title: 'Depo',
    description: 'Depodaki stoğu görüntüle, pazarlara transfer et',
    to: '/depo',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  {
    key: 'kasaci',
    roles: ['CASE_MANAGER', 'ADMIN'],
    icon: Boxes,
    title: 'Kasacı',
    description: 'Şoföre kasa ver, pazardan iade al, bakiyeleri görüntüle',
    to: '/kasaci',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
  {
    key: 'admin',
    roles: ['ADMIN', 'ACCOUNTING'],
    icon: Settings,
    title: 'Admin Panel',
    description: 'Kullanıcı, ürün, pazar, fiyat, finans ve rapor yönetimi',
    to: '/admin',
    color: 'text-primary',
    bg: 'bg-primary/10',
  },
]

export function RoleSelectPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  const cards = ALL_CARDS.filter((c) => hasAnyRoleArr(user, c.roles))

  // Tek erişim varsa direkt yönlendir
  if (cards.length === 1) {
    return <Navigate to={cards[0].to} replace />
  }

  function handleLogout() {
    logout()
    navigate('/giris')
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <span className="text-4xl">🌿</span>
          <h1 className="text-2xl font-bold text-text-primary mt-3">
            Hoş geldin{user?.name ? `, ${user.name}` : ''}
          </h1>
          <p className="text-sm text-text-muted mt-1">Hangi panele girmek istiyorsun?</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <button
                key={card.key}
                onClick={() => navigate(card.to)}
                className="bg-white border border-border rounded-2xl shadow-card p-6 flex flex-col items-center text-center hover:border-primary hover:shadow-md transition-all group"
              >
                <div className={`w-14 h-14 rounded-2xl ${card.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-7 h-7 ${card.color}`} />
                </div>
                <h2 className="text-lg font-bold text-text-primary">{card.title}</h2>
                <p className="text-xs text-text-muted mt-2 leading-relaxed">{card.description}</p>
              </button>
            )
          })}
        </div>

        <div className="text-center mt-8">
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Çıkış yap
          </button>
        </div>
      </div>
    </div>
  )
}
