// Service worker — offline uygulama kabuğu.
//
// GÖREVİ SADECE KABUK: HTML/JS/CSS offline'da açılabilsin. Veri senkronu bunun
// işi DEĞİL, onu lib/syncQueue.js yapıyor (IndexedDB kuyruk). Sebep: iOS'ta
// Background Sync API yok — SW'ye kuyruk koymak, ön planda zaten çalışan
// mekanizmayı ikinci kez, daha kısıtlı bir ortamda yazmak olurdu.
//
// /api İSTEKLERİ HİÇ CACHE'LENMEZ: stok, fiyat, cari borç bayat gösterilirse
// operatör yanlış karar verir. Referans listelerinin (pazar/ürün) offline
// kopyası ayrı ve bilinçli — IndexedDB'de, tarihiyle birlikte (api.js → cached).
//
// PRECACHE LİSTESİ index.html'DEN TÜRETİLİYOR: build çıktısı hash'li
// (assets/index-a1b2c3.js), liste burada elle yazılamaz. Kurulumda '/' indirilip
// içindeki /assets/... referansları ayıklanıyor ve hepsi cache'e alınıyor.
//
// Neden gerekli: SW ilk sayfa yüklemesinin ORTASINDA aktifleşiyor, o yükleme
// asset'leri SW'den geçmiyor. Precache olmasa uygulama ancak ikinci gezinmeden
// sonra offline açılabilirdi — hal sabah açıp tek ekranda çalışırsa kesintide
// beyaz ekran gelirdi.
//
// NEDEN vite-plugin-pwa yok: tek kazancı bu liste ve onu 6 satırda üretiyoruz.
// Vite 8 ile eklenti uyumu da doğrulanmamış.

const CACHE = 'hal-shell-v1'

// ignoreVary ŞART. Sunucu asset'lere "Vary: Origin" koyuyor ve CacheStorage
// eşleşmesi Vary'de listelenen header'ları karşılaştırıyor. Precache kaydı
// SW içinden alındığı için Origin header'ı taşımıyor (no-cors/omit), oysa
// tarayıcının script isteği Vite'ın crossorigin etiketi yüzünden Origin
// gönderiyor → cache HIT olması gerekirken MISS oluyordu. Belirti: offline'da
// index.html geliyor, bütün JS ERR_FAILED, ekran beyaz kalıyor.
// Aynı origin + hash'li dosya adları olduğu için Vary'yi yok saymak güvenli.
const MATCH_OPTS = { ignoreVary: true }

// index.html içindeki hash'li asset yollarını çıkar. Kasıtlı olarak dar:
// yalnızca /assets/ altındaki src/href değerleri.
function assetUrls(html) {
  return [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE)
        // Kabuğun giriş noktası: offline'da hangi URL istenirse istenin (SPA
        // route) döndürülecek belge bu. cache:'reload' → tarayıcı HTTP cache'ini
        // atla, yeni deploy'un index.html'i gelsin.
        const res = await fetch(new Request('/', { cache: 'reload' }))
        if (!res.ok) return
        await cache.put('/', res.clone())
        // Tek tek: biri 404 olursa (deploy yarıda kaldıysa) diğerleri yine girsin.
        // addAll all-or-nothing çalışıyor, kurulumu tamamen düşürürdü.
        const html = await res.text()
        await Promise.all(
          assetUrls(html).map((u) => cache.add(u).catch(() => {}))
        )
      } catch {
        // İlk kurulum ağsız yapıldıysa kurulum yine tamamlanmalı: sonraki
        // gezinmelerde fetch handler cache'i kendi doldurur.
      }
    })()
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // API ve sağlık yoklaması SW'den geçmez: connectionStore'un ping'i gerçek ağ
  // durumunu ölçmeli, cache'ten 200 alırsa kesintiyi hiç göremez.
  if (url.pathname.startsWith('/api/')) return

  // SPA gezinmesi: ağ önce (yeni deploy hemen gelsin), ağ yoksa kabuk.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put('/', res.clone())).catch(() => {})
          return res
        })
        .catch(() => caches.match('/', MATCH_OPTS).then((hit) => hit ?? Response.error()))
    )
    return
  }

  // Asset: cache önce (hash'li dosyalar değişmez), yoksa ağdan al ve sakla.
  event.respondWith(
    caches.match(request, MATCH_OPTS).then((hit) => {
      if (hit) return hit
      return fetch(request).then((res) => {
        // Yalnızca sağlam yanıtlar saklanır; hatalı/opaque yanıt cache'i kirletir
        // ve sonraki açılışta bozuk asset servis edilir.
        //
        // type 'basic' ARANMIYOR: Vite script/link etiketlerine crossorigin
        // ekliyor, bu yüzden same-origin asset bile type:'cors' dönüyor.
        // "basic" şartı koyulduğunda TÜM asset'ler cache dışı kalıyordu —
        // offline açılışta index.html geliyor ama React hiç mount olmuyordu.
        // Origin filtresi yukarıda zaten var, burada opaque'i dışlamak yeterli.
        if (res.ok && res.type !== 'opaque') {
          caches.open(CACHE).then((c) => c.put(request, res.clone())).catch(() => {})
        }
        return res
      })
    })
  )
})
