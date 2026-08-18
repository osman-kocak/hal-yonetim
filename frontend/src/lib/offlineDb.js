// IndexedDB katmanı — offline kuyruk + referans veri cache.
//
// NEDEN IndexedDB (localStorage değil): kuyruk kayıt kaybını affetmez.
// localStorage senkron çalışır (yazarken UI donar), ~5MB kotası vardır ve
// kotanın dolduğunu ancak exception ile öğrenirsin. sessionStorage ise sekme
// kapanınca gider — iPad arka planda sekmeyi öldürüyor (bkz. EntryForm draft
// yorumu). IndexedDB asenkron, ~50MB+ ve kalıcı.
//
// NEDEN paket yok (idb, dexie): iki store ve altı fonksiyon için bağımlılık
// eklemek bundle'a bedava gelmiyor. Native API verbose ama buradaki yüzeyi dar.
//
// iOS SINIRI: ana ekrana PWA olarak eklenmemiş Safari sekmesinde 7 gün
// kullanılmazsa storage silinir (ITP). Ana ekran PWA'sı bu kuraldan muaf —
// bu yüzden iPad kurulumu MDM'de "ana ekrana ekle" olarak yapılmalı, yoksa
// kuyruk bir hafta sonra sessizce boşalır.

const DB_NAME = 'hal_offline'
const DB_VERSION = 1

export const QUEUE_STORE = 'queue'
export const CACHE_STORE = 'cache'

// Kuyruk kalemi durumları.
// PENDING  → gönderilmeyi bekliyor
// REJECTED → sunucu kalıcı olarak reddetti (validasyon/yetki). Otomatik tekrar
//            denenmez; operatör görüp elle düzeltmeli. Sessizce silmek veri
//            kaybıdır — mal fiziksel olarak gelmiş, kaydı tutmuyoruz demek.
export const PENDING = 'PENDING'
export const REJECTED = 'REJECTED'

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const q = db.createObjectStore(QUEUE_STORE, { keyPath: 'seq', autoIncrement: true })
        // seq = gönderim sırası. FIFO şart: aynı oturuma yazılan satırlar
        // giriş sırasını korumalı, sonradan gelen kalem öne geçmemeli.
        q.createIndex('status', 'status')
        q.createIndex('clientId', 'clientId', { unique: true })
      }
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    // Başka sekme sürüm yükseltirken bu bağlantı bloke ediyorsa kapat, yoksa
    // iki sekme birbirini süresiz bekletir.
    req.onblocked = () => reject(new Error('IndexedDB blocked'))
  })
  return dbPromise
}

// Tek yerde tx sarmalama: her çağıranın onsuccess/onerror yazmasına gerek kalmasın.
async function tx(store, mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    // complete'i bekle, request'in success'ini değil: readwrite'ta veri diske
    // ancak transaction commit olunca yazılır. request başarılı olup transaction
    // abort olursa "kaydettim" deyip kaybetmiş olurduk.
    t.oncomplete = () => resolve(req?.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error ?? new Error('IndexedDB abort'))
  })
}

// crypto.randomUUID yalnızca secure context'te var (https + localhost).
// Hal içi http erişimi olursa fallback devreye girer — çakışma olasılığı
// pratikte yok, ama benzersizlik backend'de @unique ile de korunuyor.
export function newClientId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  const rand = () => Math.random().toString(36).slice(2, 10)
  return `${Date.now().toString(36)}-${rand()}-${rand()}`
}

// clientId dışarıdan verilebilir ve VERİLMELİ: form önce doğrudan göndermeyi
// dener, timeout alırsa kuyruğa düşer. Timeout "istek gitmedi" demek DEĞİL —
// sunucu kaydı yazmış, yanıt yolda kaybolmuş olabilir. Aynı clientId ile
// yeniden gönderilirse backend ikinci kaydı yazmaz; yeni clientId üretilirse
// her kesinti çift kayıt üretir.
export async function queueAdd(kind, payload, clientId = newClientId()) {
  const item = {
    clientId,
    kind,
    payload,
    status: PENDING,
    createdAt: Date.now(),
    tries: 0,
    lastError: null,
  }
  await tx(QUEUE_STORE, 'readwrite', (s) => s.add(item))
  return item
}

export function queueAll() {
  return tx(QUEUE_STORE, 'readonly', (s) => s.getAll())
}

// Gönderilecek ilk kalem. REJECTED olanlar atlanır — biri reddedildi diye
// arkasındaki sağlam kayıtlar rehin kalmamalı.
export async function queueNextPending() {
  const all = await queueAll()
  return all.find((i) => i.status === PENDING) ?? null
}

export function queueUpdate(item) {
  return tx(QUEUE_STORE, 'readwrite', (s) => s.put(item))
}

export function queueDelete(seq) {
  return tx(QUEUE_STORE, 'readwrite', (s) => s.delete(seq))
}

export async function queueCounts() {
  const all = await queueAll()
  return {
    pending: all.filter((i) => i.status === PENDING).length,
    rejected: all.filter((i) => i.status === REJECTED).length,
  }
}

// --- Referans veri cache -------------------------------------------------
// Pazar/ürün/üretici listeleri olmadan mal kabul formu açılmaz. Online'ken
// yazılır, offline'da okunur. fetchedAt saklanıyor: ekranda "veri 14:32
// itibarıyla" yazabilmek için — bayat veriyi güncel gibi göstermek, offline
// çalışmanın en sinsi hatası.

export async function cachePut(key, data) {
  await tx(CACHE_STORE, 'readwrite', (s) => s.put({ key, data, fetchedAt: Date.now() }))
}

export function cacheGet(key) {
  return tx(CACHE_STORE, 'readonly', (s) => s.get(key))
}
