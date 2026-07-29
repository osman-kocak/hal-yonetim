import axios from 'axios'

// Timeout ŞART: yoksa ölü keep-alive bağlantısında (mobil NAT bağlantıyı sessizce
// düşürür) tarayıcı TCP retransmit'i bekler — istek ~2 dk asılı kalır, sonra
// "Network Error" döner. Kullanıcı bunu "giriş başarısız" sanıyordu.
const TIMEOUT_MS = 15000

const http = axios.create({ baseURL: '/api', timeout: TIMEOUT_MS })

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('hal_admin_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Yanıtsız istek = büyük ihtimalle ölü bağlantı. Retry taze TCP bağlantısı açar
// ve genelde anında başarılı olur; kullanıcı 2 dk yerine ~15 sn bekler.
export function isNetworkError(err) {
  return !err?.response && (
    err?.code === 'ECONNABORTED' ||
    err?.code === 'ERR_NETWORK' ||
    err?.message === 'Network Error'
  )
}

// Hata mesajı üretici — ağ hatasını sunucu hatasından ayırır ki kullanıcı
// bağlantı sorununu şifre hatası sanmasın.
export function errorMessage(err, fallback = 'Bir hata oluştu') {
  if (isNetworkError(err)) {
    return 'Bağlantı kurulamadı — internetinizi kontrol edip tekrar deneyin'
  }
  return err?.response?.data?.error ?? fallback
}

http.interceptors.response.use(
  (r) => r,
  (err) => {
    // Ağ hatasında bir kez otomatik retry (sadece bir kez — sonsuz döngü olmasın)
    const config = err?.config
    if (isNetworkError(err) && config && !config.__retried) {
      config.__retried = true
      return http(config)
    }

    // 401 = kimlik doğrulanamadı (token yok/geçersiz/süresi dolmuş) → oturumu temizle.
    // 403 = kimlik doğru ama yetki yok → oturuma dokunma, sayfa kendi hatasını göstersin.
    if (err?.response?.status === 401) {
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
  // Region (bölge oturumu)
  startRegion: (regionId) => unwrap(http.post('/region/start', { regionId })),
  completeRegion: (regionSessionId) => unwrap(http.post('/region/complete', { regionSessionId })),

  // Entry
  createEntryBatch: (data) => unwrap(http.post('/entry/batch', data)),
  updateEntry: (id, data) => unwrap(http.put(`/entry/${id}`, data)),
  deleteEntry: (id) => unwrap(http.delete(`/entry/${id}`)),
  getSessionEntries: (sessionId) => unwrap(http.get(`/region/${sessionId}/entries`)),

  // Public — mal kabul paneli için
  getRegions: () => unwrap(http.get('/regions')),
  getProducersForRegion: (regionId) => unwrap(http.get(`/regions/${regionId}/producers`)),
  getProducts: () => unwrap(http.get('/products')),

  // Markets
  getMarkets: () => unwrap(http.get('/markets')),
  // Çıkış ekranı için: bayi listesi + bekleyen kasa sayısı (yetki gerektirir)
  getMarketsWithPending: () => unwrap(http.get('/markets', { params: { withPending: 1 } })),
  getMarketEntries: (marketId) => unwrap(http.get(`/markets/${marketId}/entries`)),

  // Exit
  createExit: (marketId, entryIds) => unwrap(http.post('/exit', { marketId, entryIds })),

  // Admin Auth
  adminLogin: (username, password) => unwrap(http.post('/admin/auth/login', { username, password })),
  authMe: () => unwrap(http.get('/admin/auth/me')),

  // Depo
  getDepoEntries: () => unwrap(http.get('/depo/entries')),
  createGroupedTransfer: (data) => unwrap(http.post('/depo/transfer-grouped', data)),
  createDepoReturn: (data) => unwrap(http.post('/depo/return', data)),
  listDepoReturns: (params) => unwrap(http.get('/depo/returns', { params })),
  deleteDepoReturn: (id) => unwrap(http.delete(`/depo/returns/${id}`)),
  getAdminTransfers: (params) => unwrap(http.get('/admin/transfers', { params })),

  // Kasacı (case manager) paneli — /cases (CASE_MANAGER + ADMIN)
  // NOT: GET /cases/movements'ın çağıranı yok; adlandırması aşağıdaki admin
  // getCaseMovements ile ÇAKIŞIYORDU (sonraki anahtar kazanıyor, ikisi de admin
  // rotasına gidiyordu → kasacı 403 alıyordu). Kaldırıldı.
  getCaseMarketBalances: () => unwrap(http.get('/cases/balances/markets')),
  createCaseMovement: (data) => unwrap(http.post('/cases/movements', data)),

  // Admin CRUD
  getAdminRegions: () => unwrap(http.get('/admin/regions')),
  createRegion: (data) => unwrap(http.post('/admin/regions', data)),
  updateRegion: (id, data) => unwrap(http.put(`/admin/regions/${id}`, data)),
  deleteRegion: (id) => unwrap(http.delete(`/admin/regions/${id}`)),

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
  getAnalyticsByRegion: (params) => unwrap(http.get('/admin/analytics/by-region', { params })),
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

  // Case Movements (Admin Kasa Takip) — /admin (ADMIN + ACCOUNTING)
  // createAdminCaseMovement, kasacının createCaseMovement'ından AYRI olmalı:
  // rotalar farklı role gerektiriyor (admin rotasında ACCOUNTING var, kasacı rotasında yok).
  getCaseMovements: (params) => unwrap(http.get('/admin/case-movements', { params })),
  createAdminCaseMovement: (data) => unwrap(http.post('/admin/case-movements', data)),
  deleteCaseMovement: (id) => unwrap(http.delete(`/admin/case-movements/${id}`)),
  getMarketCaseBalances: () => unwrap(http.get('/admin/case-balances/markets')),

  // Reports
  getDailyReport: (date) => unwrap(http.get('/admin/reports/daily', { params: { date } })),
  getByMarketReport: (date) => unwrap(http.get('/admin/reports/by-market', { params: { date } })),
  getByProductReport: (date) => unwrap(http.get('/admin/reports/by-product', { params: { date } })),
  getFireReport: (params) => unwrap(http.get('/admin/reports/fire', { params })),

  // Denetim (audit)
  logExport: (resource, recordCount) => unwrap(http.post('/admin/audit/export', { resource, recordCount })),
  getAuditLogs: (params) => unwrap(http.get('/admin/audit', { params })),
  getTopProducts: (days = 7, limit = 10) =>
    unwrap(http.get('/admin/reports/top-products', { params: { days, limit } })),
}
