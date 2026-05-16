import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { EntryPage } from '@/pages/Entry/EntryPage'
import { ExitPage } from '@/pages/Exit/ExitPage'
import { MarketExitDetail } from '@/pages/Exit/MarketExitDetail'
import { AdminLayout } from '@/pages/Admin/AdminLayout'
import { LoginPage as AdminLoginPage } from '@/pages/Admin/LoginPage'
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
import { DepoLayout } from '@/pages/Depo/DepoLayout'
import { DepoLoginPage } from '@/pages/Depo/DepoLoginPage'
import { DepoTransferPage } from '@/pages/Depo/DepoTransferPage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { ToastProvider } from '@/components/ui/Toast'

const router = createBrowserRouter([
  // Merkezi giriş sayfası
  { path: '/giris', element: <LoginPage /> },
  // Geriye uyumluluk: eski giriş sayfaları
  { path: '/admin/giris', element: <AdminLoginPage /> },
  { path: '/depo/giris', element: <DepoLoginPage /> },

  // Operatör paneli — auth gerekli (her rol erişebilir, ama mantıken OPERATOR/ADMIN)
  {
    path: '/',
    element: <ProtectedRoute><EntryPage /></ProtectedRoute>,
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
