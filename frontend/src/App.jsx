import { useEffect } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { api } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { EntryPage } from '@/pages/Entry/EntryPage'
import { ExitPage } from '@/pages/Exit/ExitPage'
import { MarketExitDetail } from '@/pages/Exit/MarketExitDetail'
import { AdminLayout } from '@/pages/Admin/AdminLayout'
import { DashboardPage } from '@/pages/Admin/DashboardPage'
import { RegionsPage } from '@/pages/Admin/RegionsPage'
import { ProducersPage } from '@/pages/Admin/ProducersPage'
import { ProductsPage } from '@/pages/Admin/ProductsPage'
import { MarketsPage } from '@/pages/Admin/MarketsPage'
import { QualitiesPage } from '@/pages/Admin/QualitiesPage'
import { ReportsPage } from '@/pages/Admin/ReportsPage'
import { PricesPage } from '@/pages/Admin/Prices/PricesPage'
import { ProducerPaymentsPage } from '@/pages/Admin/ProducerPayments/ProducerPaymentsPage'
import { InvoiceApprovalPage } from '@/pages/Admin/Invoices/InvoiceApprovalPage'
import { HistoryPage } from '@/pages/Admin/HistoryPage'
import { CaseTrackingPage } from '@/pages/Admin/CaseTrackingPage'
import { DepoPage as AdminDepoPage } from '@/pages/Admin/DepoPage'
import { TransfersPage } from '@/pages/Admin/TransfersPage'
import { FinancePage } from '@/pages/Admin/FinancePage'
import { UsersPage } from '@/pages/Admin/UsersPage'
import { ReturnsPage } from '@/pages/Admin/ReturnsPage'
import { FirePage } from '@/pages/Admin/FirePage'
import { AuditPage } from '@/pages/Admin/AuditPage'
import { OutagesPage } from '@/pages/Admin/OutagesPage'
import { ReturnPage } from '@/pages/Return/ReturnPage'
import { DepoLayout } from '@/pages/Depo/DepoLayout'
import { DepoTransferPage } from '@/pages/Depo/DepoTransferPage'
import { LoginPage } from '@/pages/LoginPage'
import { RoleSelectPage } from '@/pages/RoleSelectPage'
import { CaseManagerPage } from '@/pages/CaseManager/CaseManagerPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProtectedRoute, PublicOnlyRoute } from '@/components/ProtectedRoute'
import { WatermarkedLayout } from '@/components/ScreenWatermark'
import { ToastProvider } from '@/components/ui/Toast'
import { IrsaliyePrintHost } from '@/components/IrsaliyePrint'
import { PaymentReceiptPrintHost } from '@/components/PaymentReceiptPrint'
import { OfflineBanner } from '@/components/OfflineBanner'
import { startConnectionMonitor } from '@/store/connectionStore'
import { startQueueSync } from '@/lib/syncQueue'

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

  // Saha panelleri — ekran filigranı yalnızca bu gruba uygulanır. Admin/muhasebe
  // masaüstünden çalışıyor, oralarda filigran istenmiyor (bkz. WatermarkedLayout).
  {
    element: <WatermarkedLayout />,
    children: [
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

      // İade kabul — bayiden gelen mal. Depo ile aynı yetki: iade depoya/pazara
      // stok yazar, borç düşer.
      {
        path: '/iade',
        element: <ProtectedRoute roles={['DEPO', 'ADMIN']}><ReturnPage /></ProtectedRoute>,
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
      { path: 'uretici-odeme', element: <ProducerPaymentsPage /> },
      { path: 'fatura-onay', element: <InvoiceApprovalPage /> },
      { path: 'takip', element: <HistoryPage /> },
      { path: 'depo', element: <AdminDepoPage /> },
      { path: 'kasalar', element: <CaseTrackingPage /> },
      { path: 'transferler', element: <TransfersPage /> },
      { path: 'iadeler', element: <ReturnsPage /> },
      { path: 'fire', element: <FirePage /> },
      { path: 'kullanicilar', element: <UsersPage /> },
      { path: 'erisim-kayitlari', element: <AuditPage /> },
      { path: 'kesintiler', element: <OutagesPage /> },
      { path: 'bolgeler', element: <RegionsPage /> },
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
  // Açılışta token'ı sunucuya doğrulat. localStorage'daki token tek başına
  // "giriş yapılmış" demek değil — hesap pasife alınmış veya rolleri değişmiş
  // olabilir. 401 gelirse api interceptor'ı oturumu kapatıp /giris'e atar.
  useEffect(() => {
    if (!useAuthStore.getState().isAuthenticated) return
    api.authMe()
      .then((user) => useAuthStore.getState().setUser(user))
      .catch(() => {})
  }, [])

  // Bağlantı izleme: kesinti şeridini besler ve kesinti sürelerini ölçer.
  useEffect(() => startConnectionMonitor(), [])

  // Offline kuyruk: bekleyen mal kabul kayıtlarını bağlantı gelince gönderir.
  // Açılışta da çalışır — iPad kapatılıp açıldığında kuyruk devam etsin.
  useEffect(() => startQueueSync(), [])

  return (
    <>
      <OfflineBanner />
      <RouterProvider router={router} />
      <ToastProvider />
      {/* Router dışında: irsaliye kesip /cikis'e dönerken yazdırma ekranı kapanmasın */}
      <IrsaliyePrintHost />
      {/* Makbuz host'u da router DIŞINDA: yazdırma sayfa değişiminden bağımsız
          olmalı ve printStore iki slotu birbirini null'layarak tek belge garantisi
          veriyor (bkz. store/printStore.js). */}
      <PaymentReceiptPrintHost />
    </>
  )
}
