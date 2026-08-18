import axios from 'axios'
import { useConnectionStore } from '@/store/connectionStore'
import { cacheGet, cachePut } from '@/lib/offlineDb'
import { useQueueStore } from '@/store/queueStore'

// Timeout ŞART: yoksa ölü keep-alive bağlantısında (mobil NAT bağlantıyı sessizce
// düşürür) tarayıcı TCP retransmit'i bekler — istek ~2 dk asılı kalır, sonra
// "Network Error" döner. Kullanıcı bunu "giriş başarısız" sanıyordu.
const TIMEOUT_MS = 15000

// export: offline kuyruk motoru (lib/syncQueue.js) aynı instance'ı kullanır —
// token interceptor'ı, retry'ı ve kesinti raporlaması ortak olsun. Kuyruk kendi
// axios'unu kursa bunların hepsini tekrar kurmak gerekirdi.
export const http = axios.create({ baseURL: '/api', timeout: TIMEOUT_MS })

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

// Ağ hatasında kaç kez yeniden denensin. Tek deneme haldeki kısa kesintilerde
// yetmiyordu (router yeniden bağlanırken 2-3 sn pencere oluyor); üstel bekleme
// ile toplam ~2 sn ek gecikme karşılığında istek çoğu kesintiyi atlatıyor.
const MAX_RETRIES = 3
const RETRY_DELAYS_MS = [300, 800, 1500]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

http.interceptors.response.use(
  (r) => {
    // Başarılı istek = bağlantı iyi. Kesinti açıksa burada kapanır ve süresi loglanır.
    useConnectionStore.getState().reportSuccess()
    return r
  },
  async (err) => {
    // Ağ hatasında üstel beklemeli retry (sayaçlı — sonsuz döngü olmasın)
    const config = err?.config
    if (isNetworkError(err) && config) {
      config.__retryCount = (config.__retryCount ?? 0) + 1
      if (config.__retryCount <= MAX_RETRIES) {
        await sleep(RETRY_DELAYS_MS[config.__retryCount - 1] ?? 1500)
        return http(config)
      }
      // Denemeler tükendi → gerçek kesinti. Banner açılır, süre ölçülmeye başlar.
      useConnectionStore.getState().reportFailure()
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

// Sayfalanan endpoint'ler { data, total, page, limit, hasMore } döner. Sadece
// listeye ihtiyaç duyan çağıranlar bunu kullanır; düz dizi dönen eski biçim de
// kabul edilir — deploy sırasında frontend/backend sürüm farkında ekran boş
// kalmasın diye (tarayıcı cache'i eski bundle'ı tutabiliyor).
export const asList = (res) => (Array.isArray(res) ? res : (res?.data ?? []))

// Export için: sayfalanan bir endpoint'in TÜM sayfalarını çeker. Pagination
// eklendikten sonra "Çıktı Al" ekrandaki 50 satırı indiriyordu — muhasebe için
// sessiz veri kaybı. maxRows tarayıcıyı kilitlememek için üst sınır.
export async function fetchAllPages(fn, params = {}, { pageSize = 200, maxRows = 20000 } = {}) {
  const out = []
  for (let page = 1; ; page++) {
    const res = await fn({ ...params, page, limit: pageSize })
    const rows = asList(res)
    out.push(...rows)
    const more = !Array.isArray(res) && res?.hasMore
    if (!more || !rows.length || out.length >= maxRows) break
  }
  return out
}

// Referans veri okuması: online'ken IndexedDB'ye yazar, ağ hatasında oradan
// okur. Mal kabul formu pazar/ürün listesi olmadan AÇILMAZ — kesintide form
// boş gelirse offline kuyruk da işe yaramaz.
//
// Yalnızca AĞ hatasında cache'e düşer: 401/403/500 geldiğinde bayat veri
// döndürmek yanlış olur (yetki kalkmış olabilir, sunucu hatası gizlenir).
//
// Cache'ten okunduğunda tarih store'a yazılır ki ekran "veri 14:32 itibarıyla"
// diyebilsin. Bayat veriyi güncel gibi göstermek offline çalışmanın en sinsi
// hatası: operatör dün kapanmış bir pazara mal yazar.
async function cached(key, fetcher) {
  try {
    const data = await fetcher()
    cachePut(key, data).catch(() => {}) // kota dolu olabilir, okuma yine çalışsın
    useQueueStore.getState().setRefDataAt(null)
    return data
  } catch (err) {
    if (!isNetworkError(err)) throw err
    const hit = await cacheGet(key)
    if (!hit) throw err
    useQueueStore.getState().setRefDataAt(hit.fetchedAt)
    return hit.data
  }
}

// Mal kabul akışının offline çalışması için gereken TÜM referans veriyi önden
// indirir (online'ken).
//
// NEDEN: cached() yalnızca ekranın o an istediğini saklıyordu. Operatör
// online'ken yalnızca Girne'ye girdiyse, kesintide Güzelyurt'u açtığında üretici
// listesi boş geliyor ve ekran "bu bölgeye üretici atanmamış" diyordu — yanlış
// bilgi, aslında veri hiç indirilmemişti.
//
// Ağ hatası yutuluyor: prefetch bir iyileştirme, akışı durdurmamalı. Zaten
// kesintideysek cache'te ne varsa onunla çalışılır.
export async function prefetchEntryRefData() {
  try {
    const [regions] = await Promise.all([
      api.getRegions(),
      api.getProducts(),
      api.getMarkets(),
    ])
    // Bölge sayısı az (≈8) ve üretici listesi küçük; hepsini almak birkaç yüz
    // KB. Karşılığında kesintide HANGİ bölge açılırsa açılsın form dolu geliyor.
    await Promise.all(
      (Array.isArray(regions) ? regions : []).map((r) =>
        api.getProducersForRegion(r.id).catch(() => null)
      )
    )
  } catch {
    // sessiz: bağlantı yoksa zaten cache'ten çalışılıyor
  }
}

export const api = {
  // Region (bölge oturumu)
  // NOT: bunlar offline ÇALIŞMAZ. Kesintide yeni bölge oturumu açılamaz —
  // entry'lerin bağlanacağı regionSessionId sunucudan geliyor (bkz. syncQueue
  // HANDLERS yorumu). Aktif oturum varken mal kabul offline sürer.
  startRegion: (regionId) => unwrap(http.post('/region/start', { regionId })),
  completeRegion: (regionSessionId) => unwrap(http.post('/region/complete', { regionSessionId })),

  // Entry
  createEntryBatch: (data) => unwrap(http.post('/entry/batch', data)),
  updateEntry: (id, data) => unwrap(http.put(`/entry/${id}`, data)),
  deleteEntry: (id) => unwrap(http.delete(`/entry/${id}`)),
  getSessionEntries: (sessionId) => unwrap(http.get(`/region/${sessionId}/entries`)),

  // Public — mal kabul paneli için. Üçü de mal kabul akışının offline
  // çalışabilmesi için cache'li (bkz. cached()).
  getRegions: () => cached('regions', () => unwrap(http.get('/regions'))),
  getProducersForRegion: (regionId) =>
    cached(`producers:${regionId}`, () => unwrap(http.get(`/regions/${regionId}/producers`))),
  getProducts: () => cached('products', () => unwrap(http.get('/products'))),

  // Markets
  // Cache'li: mal kabulde her satır pazar seçiyor, liste olmadan form kilitli.
  // withPending varyantı (çıkış ekranı) BİLEREK cache'siz — bekleyen kasa
  // sayısı canlı veri, bayatı yanlış karar üretir.
  getMarkets: () => cached('markets', () => unwrap(http.get('/markets'))),
  // Çıkış ekranı için: bayi listesi + bekleyen kasa sayısı (yetki gerektirir)
  getMarketsWithPending: () => unwrap(http.get('/markets', { params: { withPending: 1 } })),
  getMarketEntries: (marketId) => unwrap(http.get(`/markets/${marketId}/entries`)),
  // Çıkış ekranından kaldırılıp depoya gönderilenler (gri satırlar)
  getRemovedEntries: (marketId) => unwrap(http.get(`/markets/${marketId}/removed-entries`)),

  // Exit
  createExit: (marketId, entryIds) => unwrap(http.post('/exit', { marketId, entryIds })),
  // Çıkış ekranı kilidi: aynı pazarı iki operatör aynı anda açmasın.
  // POST hem alır hem yeniler (ekran 30 sn'de bir çağırıyor); 409 = kilit
  // başkasında. DELETE best-effort — gitmezse sunucu 2 dk sonra düşürüyor.
  acquireExitLock: (marketId) => unwrap(http.post(`/exit/lock/${marketId}`)),
  releaseExitLock: (marketId) => unwrap(http.delete(`/exit/lock/${marketId}`)),
  // toMarketId verilmezse kalem DEPO'ya döner (satırdaki X butonu); verilirse
  // doğrudan o pazara aktarılır (yanlış pazar düzeltmesi).
  // quantity verilmezse kalemin TAMAMI taşınır; verilirse kalem bölünür
  // (kasada kasa adedi, bağ/adette bağ sayısı).
  removeEntryToDepo: (entryId, toMarketId, quantity) =>
    unwrap(http.post('/exit/remove-entry', {
      entryId,
      ...(toMarketId != null && { toMarketId }),
      ...(quantity != null && { quantity }),
    })),
  undoRemoveEntry: (transferId) => unwrap(http.post(`/exit/remove-entry/${transferId}/undo`)),

  // Admin Auth
  adminLogin: (username, password) => unwrap(http.post('/admin/auth/login', { username, password })),
  authMe: () => unwrap(http.get('/admin/auth/me')),

  // Depo
  getDepoEntries: () => unwrap(http.get('/depo/entries')),
  createGroupedTransfer: (data) => unwrap(http.post('/depo/transfer-grouped', data)),
  createDepoReturn: (data) => unwrap(http.post('/depo/return', data)),
  // Tek bayi, çok satır — backend hepsini TEK transaction'da yazar, biri
  // patlarsa hiçbiri yazılmaz (cari hesaba yarım iade işlenmesin).
  createDepoReturnBatch: (data) => unwrap(http.post('/depo/return/batch', data)),
  // Bayiye son 7 günde ne gönderildi / ne iade alındı — iade ekranı yanlış
  // ürün seçimini burada yakalıyor.
  getMarketBalance: (marketId) => unwrap(http.get(`/depo/market-balance/${marketId}`)),
  // Admin/muhasebe depo görünümü — /api/depo ACCOUNTING'e kapalı olduğu için ayrı yol
  getAdminDepoEntries: () => unwrap(http.get('/admin/depo/entries')),
  createManualDepoEntry: (data) => unwrap(http.post('/admin/depo/entry', data)),
  listDepoReturns: (params) => unwrap(http.get('/depo/returns', { params })),
  // Saha iade ekranındaki "son iadeler" kutusu — düz dizi bekler
  listRecentReturns: (limit = 10) =>
    unwrap(http.get('/depo/returns', { params: { limit } })).then(asList),
  deleteDepoReturn: (id) => unwrap(http.delete(`/depo/returns/${id}`)),
  getAdminTransfers: (params) => unwrap(http.get('/admin/transfers', { params })),

  // Kasacı (case manager) paneli — /cases (CASE_MANAGER + ADMIN)
  // NOT: GET /cases/movements'ın çağıranı yok; adlandırması aşağıdaki admin
  // getCaseMovements ile ÇAKIŞIYORDU (sonraki anahtar kazanıyor, ikisi de admin
  // rotasına gidiyordu → kasacı 403 alıyordu). Kaldırıldı.
  getCaseMarketBalances: () => unwrap(http.get('/cases/balances/markets')),
  getCaseRegionBalances: () => unwrap(http.get('/cases/balances/regions')),
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
  // Silinen irsaliyenin malı depoya döner (bkz. exitController.returnEntriesToDepo)
  deleteExit: (id, data) => unwrap(http.delete(`/admin/exits/${id}`, { data })),

  // Users (operatörler)
  getAdminUsers: () => unwrap(http.get('/admin/users')),
  createUser: (data) => unwrap(http.post('/admin/users', data)),
  updateUser: (id, data) => unwrap(http.put(`/admin/users/${id}`, data)),
  deleteUser: (id) => unwrap(http.delete(`/admin/users/${id}`)),

  // Kesinti ölçümü — cihaz bağlantı gelince biriken kaydı yollar (Faz 0).
  reportOutages: (data) => unwrap(http.post('/outages', data)),
  getOutages: (params) => unwrap(http.get('/admin/outages', { params })),

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
  getRegionCaseBalances: () => unwrap(http.get('/admin/case-balances/regions')),

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
