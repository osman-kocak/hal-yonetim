import { create } from 'zustand'

export const useAppStore = create((set) => ({
  activeSession: null,
  step: 'driver_select',
  selectedProducer: null,
  selectedProduct: null,
  driverBalance: null,

  setDriverBalance: (n) => set({ driverBalance: n }),

  startSession: (session) =>
    set({
      activeSession: session,
      step: 'producer_select',
      selectedProducer: null,
      selectedProduct: null,
    }),

  completeSession: () =>
    set({
      activeSession: null,
      step: 'driver_select',
      selectedProducer: null,
      selectedProduct: null,
    }),

  selectProducer: (producer) =>
    set({ selectedProducer: producer, step: 'product_select' }),

  selectProduct: (product) =>
    set({ selectedProduct: product, step: 'entry_form' }),

  // "Girişi Kaydet" — aynı üretici, başka ürün seç
  backToProducts: () =>
    set({ selectedProduct: null, step: 'product_select' }),

  // "Girişi Kaydet ve Üreticiyi Tamamla" — başka üretici seç, aynı araç
  backToProducers: () =>
    set({ selectedProducer: null, selectedProduct: null, step: 'producer_select' }),

  cancelToDrivers: () =>
    set({
      activeSession: null,
      step: 'driver_select',
      selectedProducer: null,
      selectedProduct: null,
    }),
}))
