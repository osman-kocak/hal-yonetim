import { create } from 'zustand'

let idCounter = 0

export const useToastStore = create((set) => ({
  toasts: [],

  addToast: (message, type = 'success') => {
    const id = ++idCounter
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 3500)
  },

  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
