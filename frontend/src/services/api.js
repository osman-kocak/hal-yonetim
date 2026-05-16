import axios from 'axios'

const http = axios.create({ baseURL: '/api' })

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('hal_admin_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err.response?.status
    if (status === 401) {
      localStorage.removeItem('hal_admin_token')
      localStorage.removeItem('hal_admin_user')
      if (!window.location.pathname.startsWith('/giris')) {
        const from = window.location.pathname
        window.location.href = `/giris${from && from !== '/' ? `?from=${encodeURIComponent(from)}` : ''}`
      }
    }
    return Promise.reject(err)
  }
)

const unwrap = (promise) => promise.then((r) => r.data)

export const api = {
  // Vehicle
  startVehicle: (driverId) => unwrap(http.post('/vehicle/start', { driverId })),
  completeVehicle: (vehicleSessionId, opts = {}) => unwrap(http.post('/vehicle/complete', { vehicleSessionId, ...opts })),

  // Entry
  createEntry: (data) => unwrap(http.post('/entry', data)),
  createEntryBatch: (data) => unwrap(http.post('/entry/batch', data)),
  updateEntry: (id, data) => unwrap(http.put(`/entry/${id}`, data)),
  deleteEntry: (id) => unwrap(http.delete(`/entry/${id}`)),
  getSessionEntries: (sessionId) => unwrap(http.get(`/vehicle/${sessionId}/entries`)),

  // Public — giriş paneli için (auth gerektirmez)
  getDrivers: () => unwrap(http.get('/drivers')),
  getProducers: () => unwrap(http.get('/producers')),
  getProducersForDriver: (driverId) => unwrap(http.get(`/drivers/${driverId}/producers`)),
  getProducts: () => unwrap(http.get('/products')),
  getQualities: () => unwrap(http.get('/qualities')),

  // Markets
  getMarkets: () => unwrap(http.get('/markets')),
  getMarketEntries: (marketId) => unwrap(http.get(`/markets/${marketId}/entries`)),

  // Exit
  createExit: (marketId, entryIds) => unwrap(http.post('/exit', { marketId, entryIds })),

  // Admin Auth
  adminLogin: (username, password) => unwrap(http.post('/admin/auth/login', { username, password })),
  authMe: () => unwrap(http.get('/admin/auth/me')),

  // Depo
  getDepoEntries: () => unwrap(http.get('/depo/entries')),
  createTransfer: (data) => unwrap(http.post('/depo/transfer', data)),
  createGroupedTransfer: (data) => unwrap(http.post('/depo/transfer-grouped', data)),
  createDepoReturn: (data) => unwrap(http.post('/depo/return', data)),
  listDepoReturns: (params) => unwrap(http.get('/depo/returns', { params })),
  deleteDepoReturn: (id) => unwrap(http.delete(`/depo/returns/${id}`)),
  getAdminTransfers: (params) => unwrap(http.get('/admin/transfers', { params })),

  // Kasacı (case manager) paneli
  getCaseDriverBalances: () => unwrap(http.get('/cases/balances/drivers')),
  getCaseMarketBalances: () => unwrap(http.get('/cases/balances/markets')),
  createCaseMovement: (data) => unwrap(http.post('/cases/movements', data)),
  getCaseMovements: (params) => unwrap(http.get('/cases/movements', { params })),

  // Admin CRUD
  getAdminDrivers: () => unwrap(http.get('/admin/drivers')),
  createDriver: (data) => unwrap(http.post('/admin/drivers', data)),
  updateDriver: (id, data) => unwrap(http.put(`/admin/drivers/${id}`, data)),
  deleteDriver: (id) => unwrap(http.delete(`/admin/drivers/${id}`)),

  getAdminProducers: () => unwrap(http.get('/admin/producers')),
  createProducer: (data) => unwrap(http.post('/admin/producers', data)),
  updateProducer: (id, data) => unwrap(http.put(`/admin/producers/${id}`, data)),
  deleteProducer: (id) => unwrap(http.delete(`/admin/producers/${id}`)),

  getAdminProducts: () => unwrap(http.get('/admin/products')),
  createProduct: (data) => unwrap(http.post('/admin/products', data)),
  updateProduct: (id, data) => unwrap(http.put(`/admin/products/${id}`, data)),
  deleteProduct: (id) => unwrap(http.delete(`/admin/products/${id}`)),

  getQualities_admin: () => unwrap(http.get('/admin/qualities')),
  createQuality: (data) => unwrap(http.post('/admin/qualities', data)),
  updateQuality: (id, data) => unwrap(http.put(`/admin/qualities/${id}`, data)),
  deleteQuality: (id) => unwrap(http.delete(`/admin/qualities/${id}`)),

  getAdminMarkets: () => unwrap(http.get('/admin/markets')),
  createMarket: (data) => unwrap(http.post('/admin/markets', data)),
  updateMarket: (id, data) => unwrap(http.put(`/admin/markets/${id}`, data)),
  deleteMarket: (id) => unwrap(http.delete(`/admin/markets/${id}`)),

  // History
  getExitHistory: (params) => unwrap(http.get('/admin/history/exits', { params })),
  getEntryHistory: (params) => unwrap(http.get('/admin/history/entries', { params })),
  updateExit: (id, data) => unwrap(http.put(`/admin/exits/${id}`, data)),

  // Users (operatörler)
  getAdminUsers: () => unwrap(http.get('/admin/users')),
  createUser: (data) => unwrap(http.post('/admin/users', data)),
  updateUser: (id, data) => unwrap(http.put(`/admin/users/${id}`, data)),
  deleteUser: (id) => unwrap(http.delete(`/admin/users/${id}`)),

  // Public prices (operatör paneli için)
  getPublicPrices: (date) => unwrap(http.get('/prices', { params: { date } })),

  // Prices
  getPrices: (date) => unwrap(http.get('/admin/prices', { params: { date } })),
  upsertPrice: (data) => unwrap(http.post('/admin/prices', data)),

  // Analytics (Dashboard)
  getAnalyticsOverview: (params) => unwrap(http.get('/admin/analytics/overview', { params })),
  getAnalyticsTrend: (params) => unwrap(http.get('/admin/analytics/trend', { params })),
  getAnalyticsByDriver: (params) => unwrap(http.get('/admin/analytics/by-driver', { params })),
  getAnalyticsByMarket: (params) => unwrap(http.get('/admin/analytics/by-market', { params })),
  getAnalyticsByProduct: (params) => unwrap(http.get('/admin/analytics/by-product', { params })),
  getAnalyticsQuality: (params) => unwrap(http.get('/admin/analytics/quality', { params })),

  // Finans (Cari Hesap)
  getLedger: (params) => unwrap(http.get('/admin/ledger', { params })),
  createLedgerEntry: (data) => unwrap(http.post('/admin/ledger', data)),
  deleteLedgerEntry: (id) => unwrap(http.delete(`/admin/ledger/${id}`)),
  getMarketLedgerBalances: () => unwrap(http.get('/admin/ledger/balances/markets')),
  getProducerLedgerBalances: () => unwrap(http.get('/admin/ledger/balances/producers')),
  getFinancialReport: (params) => unwrap(http.get('/admin/ledger/report', { params })),

  // Case Movements (Kasa Takip)
  getCaseMovements: (params) => unwrap(http.get('/admin/case-movements', { params })),
  createCaseMovement: (data) => unwrap(http.post('/admin/case-movements', data)),
  deleteCaseMovement: (id) => unwrap(http.delete(`/admin/case-movements/${id}`)),
  getMarketCaseBalances: () => unwrap(http.get('/admin/case-balances/markets')),
  getDriverCaseBalances: () => unwrap(http.get('/admin/case-balances/drivers')),

  // Reports
  getDailyReport: (date) => unwrap(http.get('/admin/reports/daily', { params: { date } })),
  getByMarketReport: (date) => unwrap(http.get('/admin/reports/by-market', { params: { date } })),
  getByProductReport: (date) => unwrap(http.get('/admin/reports/by-product', { params: { date } })),
  getTopProducts: (days = 7, limit = 10) =>
    unwrap(http.get('/admin/reports/top-products', { params: { days, limit } })),
}
