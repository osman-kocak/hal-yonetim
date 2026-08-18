import { useEffect, useState } from 'react'
import { WifiOff, Upload, AlertTriangle, X, RotateCw, Trash2 } from 'lucide-react'
import { useConnectionStore } from '@/store/connectionStore'
import { useQueueStore } from '@/store/queueStore'
import { queueAll, REJECTED, PENDING } from '@/lib/offlineDb'
import { retryRejected, discardRejected, flush } from '@/lib/syncQueue'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'

// Ekranın üstündeki kalıcı durum şeridi.
//
// NEDEN KALICI: Toast 3.5 sn sonra kayboluyor; operatör kesintiyi kaçırıp
// girdiğini kaydedildi sanıyordu. Şerit kesinti sürdükçe durur.
//
// ÜÇ DURUM VAR ve karıştırılmamalı:
//   1. Kesinti + kuyrukta kayıt  → veri iPad'de, gönderilmeyi bekliyor
//   2. Bağlantı var + kuyrukta kayıt → gönderim sürüyor
//   3. Reddedilen kayıt → sunucu kalıcı olarak reddetti, operatör müdahalesi şart
//
// iOS'ta arka planda senkron API'si YOK: kuyruk yalnızca uygulama ön plandayken
// ilerler. Bu yüzden şerit "Uygulamayı kapatmayın" diyor — kapatılırsa kayıtlar
// iPad'de bekler, kimse farkında olmaz.
export function OfflineBanner() {
  const online = useConnectionStore((s) => s.online)
  const offlineSince = useConnectionStore((s) => s.offlineSince)
  const pending = useQueueStore((s) => s.pending)
  const rejected = useQueueStore((s) => s.rejected)
  const panelOpen = useQueueStore((s) => s.panelOpen)
  const openPanel = useQueueStore((s) => s.openPanel)

  const offline = !online && !!offlineSince
  const show = offline || pending > 0 || rejected > 0

  return (
    <>
      {show && (
        <div className="fixed top-0 inset-x-0 z-50 flex flex-col">
          {offline
            ? <OfflineStrip key={offlineSince} since={offlineSince} pending={pending} />
            : pending > 0 && <SendingStrip pending={pending} />}
          {rejected > 0 && <RejectedStrip count={rejected} onClick={openPanel} />}
        </div>
      )}
      {/* key: her yeni kesinti popup'ı sıfırdan açar — bir önceki kesintide
          "Anladım" denmiş olması yenisini susturmamalı. */}
      {offline && <OfflinePopup key={offlineSince} since={offlineSince} pending={pending} />}
      {panelOpen && <QueuePanel />}
    </>
  )
}

// Kesinti başlarken bir kez açılan uyarı.
//
// NEDEN ŞERİDİN ÜSTÜNE POPUP: şerit ekranın en üstünde duruyor ve operatör
// forma odaklanmışken fark etmiyordu — kesintiyi ancak kayıt sırasında görüyor.
// Popup akışı kesiyor, bir kez.
//
// GECİKME: anlık takılmalarda (router 2-3 sn yeniden bağlanır) popup açılıp
// kapanması rahatsız edici. connectionStore da 5 sn altını kesinti saymıyor
// (MIN_OUTAGE_MS) — aynı eşik kullanılıyor ki ekran ile ölçüm aynı şeyi desin.
const POPUP_AFTER_MS = 5000

function OfflinePopup({ since, pending }) {
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (dismissed) return
    // Kesinti bu bileşen mount olmadan önce başlamış olabilir (sayfa offline
    // açıldıysa): kalan süreyi hesapla, sabit 5 sn bekleme.
    const wait = Math.max(0, POPUP_AFTER_MS - (Date.now() - since))
    const id = setTimeout(() => setOpen(true), wait)
    return () => clearTimeout(id)
  }, [since, dismissed])

  function close() {
    setOpen(false)
    setDismissed(true)
  }

  return (
    <Modal open={open} onClose={close} title="Bağlantı koptu">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <WifiOff className="w-6 h-6 text-error shrink-0 mt-0.5" />
          <div className="text-sm text-text-secondary space-y-2">
            <p className="font-medium text-text-primary">
              İnternet bağlantısı yok.
            </p>
            <p>
              Mal kabul girişleri iPad'de birikir, bağlantı gelince otomatik
              gönderilir. <strong className="text-text-primary">Uygulamayı kapatmayın</strong> —
              kapalıyken kayıtlar gönderilemez.
            </p>
            {pending > 0 && (
              <p className="text-warning font-medium">
                Şu an {pending} kayıt gönderilmeyi bekliyor.
              </p>
            )}
            <p className="text-text-muted">
              Çıkış (irsaliye) ve iade işlemleri bağlantı gelene kadar yapılamaz.
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={close}>Anladım</Button>
        </div>
      </div>
    </Modal>
  )
}

function OfflineStrip({ since, pending }) {
  const [seconds, setSeconds] = useState(0)

  // Date.now() yalnızca interval callback'inde: render içinde çağrılırsa bileşen
  // saf olmaz, effect gövdesinde çağrılırsa zincirleme render tetikler.
  useEffect(() => {
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - since) / 1000)), 1000)
    return () => clearInterval(id)
  }, [since])

  const label = seconds < 60
    ? `${seconds} sn`
    : `${Math.floor(seconds / 60)} dk ${seconds % 60} sn`

  return (
    <div className="bg-error text-white px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 shadow-lg">
      <WifiOff className="w-4 h-4 shrink-0" />
      {pending > 0 ? (
        <span>
          Bağlantı yok — <strong>{label}</strong>. <strong>{pending} kayıt</strong> iPad'de
          bekliyor, bağlantı gelince gönderilecek. <strong>Uygulamayı kapatmayın.</strong>
        </span>
      ) : (
        <span>
          Bağlantı yok — <strong>{label}</strong>. Yeni girişler iPad'de birikir,
          bağlantı gelince otomatik gönderilir.
        </span>
      )}
    </div>
  )
}

function SendingStrip({ pending }) {
  return (
    <div className="bg-warning text-white px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 shadow-lg">
      <Upload className="w-4 h-4 shrink-0 animate-pulse" />
      <span>
        <strong>{pending} kayıt</strong> gönderiliyor — uygulamayı kapatmayın.
      </span>
    </div>
  )
}

function RejectedStrip({ count, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-text-primary text-white px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 shadow-lg w-full"
    >
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span><strong>{count} kayıt gönderilemedi</strong> — dokunup inceleyin</span>
    </button>
  )
}

// Reddedilen ve bekleyen kalemlerin listesi.
//
// Reddedilen kayıt SİLİNMEZ, otomatik tekrar da denenmez: mal fiziksel olarak
// gelmiş, kaydı atmak sessiz veri kaybı olur. Operatör sunucu tarafındaki
// sorunu (kapanmış bölge oturumu, silinmiş pazar) düzeltip tekrar dener ya da
// "elle girdim" diyerek kaldırır.
function QueuePanel() {
  const closePanel = useQueueStore((s) => s.closePanel)
  const pending = useQueueStore((s) => s.pending)
  const rejectedCount = useQueueStore((s) => s.rejected)
  const [items, setItems] = useState([])
  const [confirmDiscard, setConfirmDiscard] = useState(null)

  // Sayaçlar değişince listeyi tazele: tekrar dene/sil sonrası panel eskimesin
  useEffect(() => {
    let alive = true
    queueAll()
      .then((all) => { if (alive) setItems(all) })
      .catch(() => {})
    return () => { alive = false }
  }, [pending, rejectedCount])

  const rejected = items.filter((i) => i.status === REJECTED)
  const waiting = items.filter((i) => i.status === PENDING)

  return (
    <div className="fixed inset-0 z-[90] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-bold text-lg text-text-primary">Gönderim Kuyruğu</h2>
          <button onClick={closePanel} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 flex flex-col gap-4">
          {rejected.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-error">
                Gönderilemedi ({rejected.length})
              </h3>
              <p className="text-xs text-text-muted">
                Sunucu bu kayıtları reddetti. Sebebi giderildikten sonra tekrar
                deneyin. Kaydı elle girdiyseniz kaldırabilirsiniz.
              </p>
              {rejected.map((item) => (
                <QueueRow
                  key={item.seq}
                  item={item}
                  onRetry={() => retryRejected(item.seq)}
                  onDiscard={() => setConfirmDiscard(item)}
                />
              ))}
            </section>
          )}

          {waiting.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-warning">
                Sırada bekliyor ({waiting.length})
              </h3>
              {waiting.map((item) => <QueueRow key={item.seq} item={item} />)}
              <Button variant="outline" onClick={() => flush()} className="self-start">
                Şimdi gönder
              </Button>
            </section>
          )}

          {!items.length && (
            <p className="text-sm text-text-muted py-8 text-center">
              Kuyruk boş — tüm kayıtlar gönderildi.
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDiscard}
        onClose={() => setConfirmDiscard(null)}
        onConfirm={async () => {
          await discardRejected(confirmDiscard.seq)
          setConfirmDiscard(null)
        }}
        title="Kaydı kuyruktan kaldır"
        description="Bu kayıt kalıcı olarak silinecek ve sunucuya HİÇ gönderilmeyecek. Yalnızca kaydı elle girdiyseniz onaylayın."
        confirmLabel="Evet, kaldır"
      />
    </div>
  )
}

function QueueRow({ item, onRetry, onDiscard }) {
  const rows = item.payload?.entries?.length ?? 0
  const time = new Date(item.createdAt).toLocaleTimeString('tr-TR', {
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="border border-border rounded-xl p-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">
          Mal kabul · {rows} satır · {time}
        </p>
        {item.lastError && (
          <p className="text-xs text-error mt-1">{item.lastError}</p>
        )}
        {item.tries > 0 && (
          <p className="text-xs text-text-muted mt-0.5">{item.tries} deneme</p>
        )}
      </div>
      {onRetry && (
        <button onClick={onRetry} title="Tekrar dene" className="text-primary p-2">
          <RotateCw className="w-4 h-4" />
        </button>
      )}
      {onDiscard && (
        <button onClick={onDiscard} title="Kuyruktan kaldır" className="text-error p-2">
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
