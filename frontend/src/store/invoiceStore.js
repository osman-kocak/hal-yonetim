import { create } from 'zustand'
import { api } from '@/services/api'

// Onay bekleyen irsaliye sayısı — sol menüdeki rozet.
//
// AYRI STORE, çünkü sayıyı ÜRETEN yer (onay ekranı) ile GÖSTEREN yer (menü)
// farklı route'larda: menü layout'ta durur, ekran Outlet'in içinde. Prop
// geçirilemez, ikisi de aynı sayıyı ayrı ayrı çekseydi onay yapıldıktan sonra
// menü eski rakamda kalırdı.
//
// POLLING YOK: sayı yalnızca (1) admin paneli açıldığında ve (2) onay/geri alma
// sonrasında tazeleniyor. Saniyede bir sorgu atmak, saatte bir değişen bir
// rakam için veritabanını boşuna yorardı.
export const useInvoiceStore = create((set) => ({
  // null = henüz bilinmiyor. 0'dan AYRI: bilinmiyorken rozet basılmamalı,
  // sıfırken de basılmamalı ama ikisi aynı şey değil — ilkinde istek daha
  // dönmemiştir.
  pendingCount: null,

  // Sunucudan taze sayı. HATA YUTULUYOR: rozet yardımcı bilgi, admin paneli
  // sayı gelmedi diye hata göstermemeli.
  refresh: async () => {
    try {
      // limit=1: yalnız sayaç lazım, liste değil.
      const r = await api.getInvoiceQueue({ status: 'pending', limit: 1 })
      if (typeof r?.pendingCount === 'number') set({ pendingCount: r.pendingCount })
    } catch { /* yok say */ }
  },

  // Onay ekranı zaten her yüklemede pendingCount alıyor — ikinci bir istek
  // atmak yerine sayıyı doğrudan buraya yazar.
  setPendingCount: (n) => set({ pendingCount: typeof n === 'number' ? n : null }),
}))

// Rozet metni. 9'dan fazlaysa "9+" — iki haneli sayı menü satırını bozuyor ve
// "152 mi 15 mi" ayrımı rozette zaten okunmuyor; asıl bilgi "çok var".
export function badgeText(count) {
  if (typeof count !== 'number' || count <= 0) return null
  return count > 9 ? '9+' : String(count)
}
