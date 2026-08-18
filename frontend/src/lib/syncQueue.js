// Offline kuyruk gönderim motoru.
//
// SIRA GARANTİSİ: kalemler seq sırasıyla, TEK TEK gönderilir. Paralel gönderim
// hızlı olurdu ama mal kabul satırlarının giriş sırası muhasebede anlamlı;
// dahası bir kalem ağ hatası alırken sonrakinin geçmesi kuyruğu deliyor.
// Ağ hatasında flush durur, bağlantı gelince baştan devam eder.
//
// IDEMPOTENCY: her kalemin clientId'si var ve backend'e gider. "İstek gitti,
// yanıt kayboldu" senaryosunda kalem kuyrukta kalır ve tekrar gönderilir;
// backend clientId'yi görüp aynı kaydı ikinci kez yazmaz (Entry.clientId
// @unique). Bu olmadan her kesinti çift kayıt üretirdi.
//
// iOS SINIRI: Background Sync API yok. Kuyruk yalnızca uygulama ÖN PLANDAYKEN
// ilerler. Operatör iPad'i kilitlerse kayıtlar bekler — bu yüzden bekleyen
// sayısı ekranda kalıcı olarak gösteriliyor (QueueBanner), operatör
// "gönderildi" sanıp uygulamayı kapatmasın.

import { http, isNetworkError } from '@/services/api'
import {
  PENDING, REJECTED,
  queueAdd, queueAll, queueNextPending, queueUpdate, queueDelete, queueCounts,
} from '@/lib/offlineDb'
import { useQueueStore } from '@/store/queueStore'

// kind → gönderim fonksiyonu. Kuyruğa yalnızca burada tanımlı işler girebilir.
// Faz 1 kapsamı: mal kabul batch'i. Bölge oturumu açma/kapama BİLİNÇLİ olarak
// dışarıda: oturum offline açılırsa entry'lerin bağlanacağı regionSessionId
// olmaz, kuyruğa bağımlılık grafiği (session → entries) gerekir. Aktif oturum
// varken kesinti olursa mal kabul çalışır; kesinti sırasında YENİ BÖLGE
// açılamaz.
const HANDLERS = {
  ENTRY_BATCH: (payload) => http.post('/entry/batch', payload),
}

let flushing = false

async function refreshCounts() {
  const counts = await queueCounts()
  useQueueStore.getState().setCounts(counts)
  return counts
}

// Kuyruğa yaz. Çağıran (form) bunu "kaydedildi" olarak DEĞİL, "kuyruğa alındı"
// olarak bildirmeli — operatör malın sunucuya gittiğini sanmamalı.
export async function enqueue(kind, payload, clientId) {
  if (!HANDLERS[kind]) throw new Error(`Bilinmeyen kuyruk işi: ${kind}`)
  const item = await queueAdd(kind, payload, clientId)
  await refreshCounts()
  // Bağlantı varken de kuyruk kullanılabilir (form her zaman kuyruğa yazar);
  // bu durumda flush hemen çalışır ve kayıt anında gider.
  flush()
  return item
}

// Hata kalıcı mı? Kalıcı = tekrar denemek aynı sonucu verir, operatör müdahalesi
// gerekir. Geçici = ağ/sunucu sorunu, sonra tekrar dene.
//
// 401'i AYRI ele alıyoruz: kalıcı değil (token yenilenince geçer) ama tekrar
// denemek de anlamsız. Kuyruk durur, api.js interceptor'ı zaten /giris'e atar.
function classify(err) {
  if (isNetworkError(err)) return 'RETRY'
  const status = err?.response?.status
  if (status === 401) return 'STOP'
  if (status === 429 || (status >= 500 && status <= 599)) return 'RETRY'
  if (status >= 400 && status <= 499) return 'REJECT'
  return 'RETRY'
}

export async function flush() {
  if (flushing) return
  if (document.hidden) return // arka planda pil harcamayalım, dönünce zaten tetiklenir
  flushing = true
  try {
    for (;;) {
      const item = await queueNextPending()
      if (!item) break

      try {
        await HANDLERS[item.kind]({ ...item.payload, clientId: item.clientId })
        // Başarılı → kuyruktan çık. Backend clientId'yi gördüyse de 2xx döner
        // (idempotent), yani "zaten yazılmış" da buraya düşer ve temizlenir.
        await queueDelete(item.seq)
      } catch (err) {
        const verdict = classify(err)
        if (verdict === 'RETRY' || verdict === 'STOP') {
          // Kalem yerinde kalır, sayaç artar. Sıra bozulmasın diye DURUYORUZ:
          // sonraki kalemi denemek, başarısız olanın arkasına geçmek olurdu.
          item.tries += 1
          item.lastError = err?.response?.data?.error ?? err?.message ?? 'Bilinmeyen hata'
          await queueUpdate(item)
          break
        }
        // REJECT → kalıcı hata. Silmiyoruz: mal fiziksel olarak geldi, kaydı
        // atmak sessiz veri kaybı. Operatöre gösterilip elle düzeltilecek.
        item.status = REJECTED
        item.tries += 1
        item.lastError = err?.response?.data?.error ?? 'Sunucu reddetti'
        await queueUpdate(item)
      }
    }
  } finally {
    flushing = false
    await refreshCounts()
  }
}

// Reddedilen kalemi tekrar kuyruğa al — operatör sunucu tarafındaki sorunu
// (eksik pazar, kapanmış oturum) düzelttikten sonra.
export async function retryRejected(seq) {
  const all = await queueAll()
  const item = all.find((i) => i.seq === seq)
  if (!item) return
  item.status = PENDING
  item.lastError = null
  await queueUpdate(item)
  await refreshCounts()
  flush()
}

// Reddedilen kalemi kalıcı olarak sil. Yalnızca operatör "bu kaydı elle girdim"
// dediğinde çağrılır — onaysız silme yolu bilerek yok.
export async function discardRejected(seq) {
  await queueDelete(seq)
  await refreshCounts()
}

// Uygulama açılışında bir kez. Bağlantı geri geldiğinde ve sekme öne
// geldiğinde flush tetikler.
export function startQueueSync() {
  refreshCounts()
  flush()

  const onOnline = () => flush()
  const onVisible = () => { if (!document.hidden) flush() }
  // Periyodik yedek: online event'i router ayakta ama internet yokken
  // tetiklenmez (navigator.onLine yalancı). connectionStore ping'i bağlantıyı
  // fark edince bu interval kuyruğu ilerletir.
  const id = setInterval(flush, 20_000)

  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    clearInterval(id)
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
