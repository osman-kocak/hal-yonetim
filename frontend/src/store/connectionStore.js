import { create } from 'zustand'

// Bağlantı durumu + kesinti ölçümü.
//
// NEDEN: Halde elektrik/internet kesintisi yaşanıyor ama ne sıklıkta ve ne kadar
// sürdüğü ölçülmedi. Offline mimarisine (PWA kuyruk, yerel sunucu, hücresel hat)
// yatırım yapmadan önce gerçek veri gerekiyor — bu store onu topluyor.
//
// SINIR: iOS'ta arka planda çalışan senkron API'si YOK (Background Sync
// desteklenmiyor). Ölçüm de senkron da yalnızca sayfa ön plandayken ilerler.

const OUTAGE_KEY = 'hal_outages'
// Hangi iPad. Sunucu üretemez — kesinti anında sunucuya zaten ulaşılamıyor.
// Cihaz başına bir kez üretilip saklanıyor; uygulama silinip yeniden
// kurulursa yeni kimlik alır, bu kabul edilebilir.
const DEVICE_KEY = 'hal_device_id'
const MAX_OUTAGES = 100          // localStorage şişmesin
const MIN_OUTAGE_MS = 5000       // 5 sn altı takılmalar kesinti sayılmaz
const PING_INTERVAL_MS = 30_000

export function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = globalThis.crypto?.randomUUID
        ? crypto.randomUUID()
        : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    // private mode: kalıcı kimlik yok, oturumluk üret — ölçüm yine de gelsin
    return 'gecici'
  }
}

function loadOutages() {
  try {
    const raw = localStorage.getItem(OUTAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveOutages(list) {
  try {
    localStorage.setItem(OUTAGE_KEY, JSON.stringify(list.slice(-MAX_OUTAGES)))
  } catch {
    // kota dolu / private mode — ölçüm kritik değil, sessizce geç
  }
}

export const useConnectionStore = create((set, get) => ({
  online: true,
  // Kesinti başlangıcı (ms). null = bağlantı iyi.
  offlineSince: null,
  outages: loadOutages(),

  // Bağlantı hatası görüldü. api.js retry'ları tükettiğinde çağırır.
  reportFailure() {
    if (get().offlineSince) return // zaten kesintideyiz, tekrar işaretleme
    set({ online: false, offlineSince: Date.now() })
  },

  // Başarılı istek/ping. Kesinti varsa kapatır ve süreyi loglar.
  reportSuccess() {
    const { offlineSince, outages } = get()
    if (!offlineSince) {
      if (!get().online) set({ online: true })
      return
    }
    const ms = Date.now() - offlineSince
    // Kısa takılmalar (tek yavaş istek) kesinti değil — logu kirletmesin
    const next = ms >= MIN_OUTAGE_MS
      ? [...outages, { start: offlineSince, end: Date.now(), ms }]
      : outages
    if (next !== outages) saveOutages(next)
    set({ online: true, offlineSince: null, outages: next })
  },

  clearOutages() {
    saveOutages([])
    set({ outages: [] })
  },

  // Biriken kesintileri sunucuya gönder ve yerelden düş.
  //
  // NEDEN GÖNDERİYORUZ: ölçüm aylardır localStorage'da birikiyordu ve okumak
  // için iPad'i Mac'e bağlayıp Safari konsolu açmak gerekiyordu — pratikte
  // kimse okumadı. Faz 2/3 kararı bu veriye dayanacak.
  //
  // Sunucu tarafında (deviceId, startedAt) UNIQUE: tekrar gönderim zararsız.
  // Bu yüzden "gönderildi" durumunu yerelde saklamıyoruz — kesintide sekme
  // ölebilir ve o işaret güvenilmez olurdu.
  async flushOutages(post) {
    const { outages } = get()
    if (!outages.length) return 0
    const gonderilen = outages.length
    await post({ deviceId: deviceId(), outages })
    // Yalnızca gönderdiklerimizi düş: gönderim sürerken yeni kesinti eklenmiş
    // olabilir, onu silmek ölçümü kaybetmek olur.
    const kalan = get().outages.slice(gonderilen)
    saveOutages(kalan)
    set({ outages: kalan })
    return gonderilen
  },
}))

// Periyodik sağlık kontrolü. Sekme arka plandayken ping atmaz (pil + gereksiz
// istek). fetch kullanılıyor (axios değil): yoklama retry/interceptor
// zincirine girmemeli, kendi sonucunu kendi raporlamalı.
//
// ADRES: kök /health DEĞİL, /api/health. Web server kök /health'i backend'e
// proxy'lemiyor — SPA fallback'e düşüp 200 + index.html döndürüyor ve yoklama
// backend ölüyken bile "iyi" diyordu. JSON kontrolü ikinci emniyet: yarın
// başka bir yol da SPA'ya düşerse sessizce yanlış cevap vermesin.
export function startConnectionMonitor() {
  const store = useConnectionStore.getState()

  async function ping() {
    if (document.hidden) return
    try {
      const res = await fetch('/api/health', { cache: 'no-store' })
      const isJson = res.headers.get('content-type')?.includes('application/json')
      if (res.ok && isJson) store.reportSuccess()
      else store.reportFailure()
    } catch {
      store.reportFailure()
    }
  }

  const id = setInterval(ping, PING_INTERVAL_MS)
  // Tarayıcının kendi sinyalleri: anlık, ping'i beklemeden tepki verir.
  // navigator.onLine yalnızca "ağ arayüzü var mı" der — router ayakta ama
  // internet yoksa true kalır; bu yüzden tek başına yeterli değil, ping şart.
  const onOnline = () => ping()
  const onOffline = () => store.reportFailure()
  const onVisible = () => { if (!document.hidden) ping() }

  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    clearInterval(id)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

// Kesinti özeti — /admin/erisim-kayitlari gibi bir ekranda gösterilebilir,
// şimdilik konsoldan okunuyor: useConnectionStore.getState().outages
export function outageSummary(outages = useConnectionStore.getState().outages) {
  if (!outages.length) return { count: 0, totalMs: 0, longestMs: 0 }
  return {
    count: outages.length,
    totalMs: outages.reduce((s, o) => s + o.ms, 0),
    longestMs: Math.max(...outages.map((o) => o.ms)),
  }
}
