import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { hasAnyRoleArr } from '@/utils/roles'

// Tüm sayfaları koruyan wrapper. Belirli rolleri zorunlu kılmak için `roles` prop'unu kullan.
export function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user } = useAuthStore()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/giris" replace state={{ from: location.pathname }} />
  }
  if (roles && roles.length && user && !hasAnyRoleArr(user, roles)) {
    // Yanlış rol — kullanıcının kendi paneline yönlendir
    return <Navigate to={roleHome()} replace />
  }
  return children
}

export function roleHome() {
  // Tüm roller önce onboarding sayfasına gider — tek erişimi olan otomatik yönlendirilir
  return '/'
}

// Login sayfalarını sarmalar: zaten giriş yapmış kullanıcı buralara gelirse ana sayfaya yönlendirir
export function PublicOnlyRoute({ children }) {
  const { isAuthenticated } = useAuthStore()
  if (isAuthenticated) return <Navigate to="/" replace />
  return children
}
