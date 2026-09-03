import { create } from 'zustand'
import { flushSync } from 'react-dom'
import { generateIrsaliye } from '@/utils/pdfGenerator'

// Yazdırılacak belge. Host bileşenler App seviyesinde durur (bkz. App.jsx).
//
// İKİ SLOT, biri dolduğunda diğeri BOŞALIR: her ikisi de .print-root kökü
// kullanıyor ve index.css yazdırmada `#root > *:not(.print-root)` dışındaki her
// şeyi gizliyor. İkisi aynı anda dolu kalırsa tek çıktıya iki belge basılır.
export const usePrintStore = create((set) => ({
  irsaliye: null,
  receipt: null,
  setIrsaliye: (exit) => set({ irsaliye: exit, receipt: null }),
  setReceipt: (r) => set({ receipt: r, irsaliye: null }),
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
export function printIrsaliye(exit, markPrinted) {
  flushSync(() => {
    usePrintStore.getState().setIrsaliye(exit)
  })
  window.print()
  // İşaretleme SONRA ve BEKLENMEDEN: window.print() öncesine await koymak iOS'ta
  // yazdırma iznini düşürüyor (yukarıdaki kural). Hata YUTULUYOR — rozet bilgi
  // amaçlı, offline iPad'de istek düşse bile fiş basılmış olmalı.
  markIrsaliyePrinted(exit, markPrinted)
}

// "Basıldı" işareti — ateşle ve unut.
//
// GÜVENİLİRLİK SINIRI: tarayıcı yazdırmanın gerçekten olduğunu söylemiyor.
// Panel açılıp iptal edilse de buraya "basıldı" gelir; ölçtüğü şey "Yazdır'a
// basıldı"dır, "kâğıt çıktı" değil. Fatura onay kuyruğu bu bilgiyi FİLTRE
// olarak kullanıyor ama filtre kapatılabilir (bkz. exitInvoiceController).
//
// DIŞARI AÇIK: yazdırma her zaman bu dosyadan geçmiyor. Masaüstünde PDF
// doğrudan indiriliyor (utils/pdfGenerator → generateIrsaliye), araya sekme
// girmiyor — o yol da baskı sayılmalı, yoksa aynı düğme iPad'de "basıldı",
// masaüstünde "hiç basılmadı" anlamına gelirdi.
export function markIrsaliyePrinted(exit, markPrinted) {
  if (!exit?.id || typeof markPrinted !== 'function') return
  try {
    Promise.resolve(markPrinted(exit.id)).catch(() => {})
  } catch { /* yok say */ }
}

// Yedek yol: yazdırma paneli açılmazsa PDF'i yeni sekmede aç. Sekme dokunuşun
// kendisinde açılmalı, PDF asenkron üretilip içine yazılır.
export function openIrsaliyePdf(exit, markPrinted) {
  const win = window.open('', '_blank')
  generateIrsaliye(exit, win)
  markIrsaliyePrinted(exit, markPrinted)
}

// Üreticiye ödeme makbuzu. printIrsaliye ile AYNI kural geçerli: araya await
// girmemeli, doğrudan tıklama handler'ından çağrılmalı — iOS yazdırma iznini
// yalnızca dokunuşun kendisinde veriyor.
export function printReceipt(payload) {
  flushSync(() => {
    usePrintStore.getState().setReceipt(payload)
  })
  window.print()
}
