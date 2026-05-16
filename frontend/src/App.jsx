import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { EntryPage } from '@/pages/Entry/EntryPage'
import { ExitPage } from '@/pages/Exit/ExitPage'
import { MarketExitDetail } from '@/pages/Exit/MarketExitDetail'
import { AdminLayout } from '@/pages/Admin/AdminLayout'
import { DashboardPage } from '@/pages/Admin/DashboardPage'
import { DriversPage } from '@/pages/Admin/DriversPage'
import { ProducersPage } from '@/pages/Admin/ProducersPage'
import { ProductsPage } from '@/pages/Admin/ProductsPage'
import { MarketsPage } from '@/pages/Admin/MarketsPage'
import { QualitiesPage } from '@/pages/Admin/QualitiesPage'
import { ReportsPage } from '@/pages/Admin/ReportsPage'
import { PricesPage } from '@/pages/Admin/PricesPage'
import { HistoryPage } from '@/pages/Admin/HistoryPage'
import { CaseTrackingPage } from '@/pages/Admin/CaseTrackingPage'
import { TransfersPage } from '@/pages/Admin/TransfersPage'
import { FinancePage } from '@/pages/Admin/FinancePage'
import { UsersPage } from '@/pages/Admin/UsersPage'
import { ReturnsPage } from '@/pages/Admin/ReturnsPage'
import { DepoLayout } from '@/pages/Depo/DepoLayout'
import { DepoTransferPage } from '@/pages/Depo/DepoTransferPage'
import { LoginPage } from '@/pages/LoginPage'
import { RoleSelectPage } from '@/pages/RoleSelectPage'
import { CaseManagerPage } from '@/pages/CaseManager/CaseManagerPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProtectedRoute, PublicOnlyRoute } from '@/components/ProtectedRoute'
import { ToastProvider } from '@/components/ui/Toast'

const router = createBrowserRouter([
  // Merkezi giriş sayfası — auth'lu kullanıcı /'a yönlendirilir
  { path: '/giris', element: <PublicOnlyRoute><LoginPage /></PublicOnlyRoute> },
  // Eski URL'ler tek giriş ekranına yönlendirilir
  { path: '/admin/giris', element: <Navigate to="/giris" replace /> },
  { path: '/depo/giris', element: <Navigate to="/giris" replace /> },

  // Ana sayfa: rol bazlı onboarding (tek erişimi olan otomatik yönlendirilir)
  {
    path: '/',
    element: <ProtectedRoute><RoleSelectPage /></ProtectedRoute>,
  },

  // Mal kabul (operatör)
  {
    path: '/mal-kabul',
    element: <ProtectedRoute roles={['OPERATOR', 'ADMIN']}><EntryPage /></ProtectedRoute>,
  },

  // Kasacı paneli
  {
    path: '/kasaci',
    element: <ProtectedRoute roles={['CASE_MANAGER', 'ADMIN']}><CaseManagerPage /></ProtectedRoute>,
  },
  {
    path: '/cikis',
    element: <ProtectedRoute><ExitPage /></ProtectedRoute>,
  },
  {
    path: '/cikis/:marketId',
    element: <ProtectedRoute><MarketExitDetail /></ProtectedRoute>,
  },

  // Depo paneli — sadece DEPO + ADMIN
  {
    path: '/depo',
    element: (
      <ProtectedRoute roles={['DEPO', 'ADMIN']}>
        <DepoLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DepoTransferPage /> },
      { path: 'transfer', element: <DepoTransferPage /> },
    ],
  },

  // Admin paneli — ADMIN + ACCOUNTING
  {
    path: '/admin',
    element: (
      <ProtectedRoute roles={['ADMIN', 'ACCOUNTING']}>
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'fiyatlar', element: <PricesPage /> },
      { path: 'finans', element: <FinancePage /> },
      { path: 'takip', element: <HistoryPage /> },
      { path: 'kasalar', element: <CaseTrackingPage /> },
      { path: 'transferler', element: <TransfersPage /> },
      { path: 'iadeler', element: <ReturnsPage /> },
      { path: 'kullanicilar', element: <UsersPage /> },
      { path: 'soforler', element: <DriversPage /> },
      { path: 'ureticiler', element: <ProducersPage /> },
      { path: 'urunler', element: <ProductsPage /> },
      { path: 'pazarlar', element: <MarketsPage /> },
      { path: 'kaliteler', element: <QualitiesPage /> },
      { path: 'raporlar', element: <ReportsPage /> },
    ],
  },

  { path: '*', element: <NotFoundPage /> },
])

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <ToastProvider />
    </>
  )
}
