import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker yalnızca PRODUCTION build'de: dev sunucusunda SW, Vite'ın HMR
// modüllerini cache'leyip kaynak değişikliklerini görünmez yapıyor.
// Offline kabuğu test etmek için `npm run build && npm run preview` kullan.
//
// Kayıt geciktirildi (load sonrası): SW indirmesi ilk render'la yarışmasın,
// açılış hızı iPad'de gözle görülür şekilde etkileniyor.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW kaydı başarısızsa uygulama online çalışmaya devam eder; offline
      // kabuğu kaybederiz ama kuyruk (IndexedDB) SW'den bağımsız çalışıyor.
    })
  })
}
