import { create } from 'zustand'

// Kuyruk sayaçları — UI'ın tek okuma noktası.
//
// NEDEN store: bekleyen sayısı hem üstteki şeritte hem kuyruk panelinde
// görünüyor, ikisi de IndexedDB'yi ayrı ayrı yoklarsa tutarsız kalırlar.
// Gerçek veri IndexedDB'de; burası yalnızca son bilinen özet.
export const useQueueStore = create((set) => ({
  pending: 0,
  rejected: 0,
  // Kuyruk paneli açık mı (şeritteki sayıya dokununca açılır)
  panelOpen: false,

  // Referans veri (pazar/ürün/üretici) cache'ten mi okundu? null = tazeydi,
  // sayı = o an itibarıyla bayat kopya kullanılıyor. Ekran bunu yazar; bayat
  // listeyi güncel gibi göstermek offline çalışmanın en sinsi hatası.
  refDataAt: null,

  setCounts: ({ pending, rejected }) => set({ pending, rejected }),
  setRefDataAt: (refDataAt) => set({ refDataAt }),
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
}))
