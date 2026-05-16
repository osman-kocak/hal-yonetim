import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

// Tüm sayfaları koruyan wrapper. Belirli rolleri zorunlu kılmak için `roles` prop'unu kullan.
export function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user } = useAuthStore()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/giris" replace state={{ from: location.pathname }} />
  }
  if (roles && roles.length && user && !roles.includes(user.role)) {
    // Yanlış rol — kullanıcının kendi paneline yönlendir
    const home = roleHome(user.role)
    return <Navigate to={home} replace />
  }
  return children
}

export function roleHome(role) {
  switch (role) {
    case 'ADMIN':
    case 'ACCOUNTING':
      return '/admin'
    case 'DEPO':
      return '/depo'
    case 'OPERATOR':
      return '/'
    default:
      return '/giris'
  }
}
