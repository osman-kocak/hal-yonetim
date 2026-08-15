import { create } from 'zustand'
import { flushSync } from 'react-dom'
import { generateIrsaliye } from '@/utils/pdfGenerator'

// Yazdırılacak irsaliye. Host bileşen App seviyesinde durur (bkz. App.jsx).
export const usePrintStore = create((set) => ({
  irsaliye: null,
  setIrsaliye: (exit) => set({ irsaliye: exit }),
}))

// iPadOS 13+ kendini "MacIntel" diye tanıtır; dokunma noktası sayısı ayırt eder.
export function isIOS() {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// Yazdırma iOS dahil TÜM platformlarda aynı yoldan gider: flushSync ile irsaliye
// sayfasını SENKRON bas, hemen ardından print(). iPad'de bu doğrudan AirPrint
// panelini açar — araya PDF adımı girmez.
//
// ARAYA await GİRMEMELİ: iOS yazdırmayı yalnızca kullanıcı dokunuşunun kendisinde
// başlatıyor, await gecikmesi izni düşürüyor. Bu fonksiyon her zaman doğrudan bir
// tıklama handler'ından çağrılmalı.
//
// GEÇMİŞ: Eskiden iOS'ta PDF blob'u yeni sekmede açılıp "Paylaş → Yazdır" deniyordu.
// İki sorunu vardı — (1) fazladan iki adım, (2) iOS Safari `blob:` adreslerinde
// Paylaş sayfasını açmıyor, yani yazdırma tamamen tıkanıyordu (2026-08-13, saha).
// Standalone (ana ekrana eklenmiş) modda print() çalışmaz; index.html
// `apple-mobile-web-app-capable` eklemeyerek bunu bilerek engelliyor.
export function printIrsaliye(exit) {
  flushSync(() => {
    usePrintStore.getState().setIrsaliye(exit)
  })
  window.print()
}

// Yedek yol: yazdırma paneli açılmazsa PDF'i yeni sekmede aç. Sekme dokunuşun
// kendisinde açılmalı, PDF asenkron üretilip içine yazılır.
export function openIrsaliyePdf(exit) {
  const win = window.open('', '_blank')
  generateIrsaliye(exit, win)
}
