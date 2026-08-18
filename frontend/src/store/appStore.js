import { create } from 'zustand'
import { cachePut } from '@/lib/offlineDb'

// Açılan bölge oturumu yerel olarak da saklanır (IndexedDB).
//
// NEDEN: kesintide sayfa yenilenirse (iPad sekmeyi öldürür, operatör yenilerse)
// uygulama service worker sayesinde açılıyor ama oturuma DÖNEMİYOR — bölge
// seçimi /region/start çağırıyor ve o istek offline'da başarısız. Kayıt formuna
// ulaşılamadığı için offline kuyruk da işe yaramıyordu.
//
// Yalnızca ÖNCEDEN açılmış oturuma dönmek için: offline'da yeni bölge açılamaz
// (sunucu id'si üretilemez, bkz. lib/syncQueue.js HANDLERS yorumu).
export const ACTIVE_SESSION_KEY = 'activeSession'

export const useAppStore = create((set) => ({
  activeSession: null, // { id, regionId, status, region: { id, name } }
  step: 'region_select',
  selectedProducer: null,
  selectedProduct: null,

  startSession: (session) => {
    // Yazma beklenmez: oturum akışı cache'e bağlı değil, cache yalnızca
    // kesinti sonrası kurtarma için.
    cachePut(ACTIVE_SESSION_KEY, session).catch(() => {})
    set({
      activeSession: session,
      step: 'producer_select',
      selectedProducer: null,
      selectedProduct: null,
    })
  },

  completeSession: () => {
    // Bölge kapandı → yerel kopya da gitmeli, yoksa kapanmış oturuma offline
    // kayıt yazılmaya devam eder.
    cachePut(ACTIVE_SESSION_KEY, null).catch(() => {})
    set({
      activeSession: null,
      step: 'region_select',
      selectedProducer: null,
      selectedProduct: null,
    })
  },

  selectProducer: (producer) =>
    set({ selectedProducer: producer, step: 'product_select' }),

  selectProduct: (product) =>
    set({ selectedProduct: product, step: 'entry_form' }),

  // "Girişi Kaydet" — aynı üretici, başka ürün seç
  backToProducts: () =>
    set({ selectedProduct: null, step: 'product_select' }),

  // "Girişi Kaydet ve Üreticiyi Tamamla" — başka üretici seç, aynı bölge
  backToProducers: () =>
    set({ selectedProducer: null, selectedProduct: null, step: 'producer_select' }),

  // Üretici adımından bölge listesine dön. Sunucudaki oturum KAPANMAZ — bölge
  // listesinde "↩ Devam et" olarak görünür, tekrar seçilince kaldığı yerden açılır.
  // Bölgeyi kapatmak için header'daki "Bölge Bitti" kullanılır (completeSession).
  backToRegions: () =>
    set({ activeSession: null, selectedProducer: null, selectedProduct: null, step: 'region_select' }),
}))
