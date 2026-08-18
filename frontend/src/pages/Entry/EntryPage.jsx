import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, prefetchEntryRefData } from '@/services/api'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'
import { RegionSelect } from './RegionSelect'
import { ProducerSelect } from './ProducerSelect'
import { ProductSelect } from './ProductSelect'
import { EntryForm } from './EntryForm'
import { RecentEntriesList } from './RecentEntriesList'
import { Clock } from '@/components/ui/Clock'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ArrowLeft, CheckCircle, MapPin, User } from 'lucide-react'
import { formatWeight, sumQty } from '@/utils/formatters'

export function EntryPage() {
  const { step, activeSession, selectedProducer, selectedProduct, completeSession } = useAppStore()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)

  // Adım değişince sayfayı başa sar.
  //
  // NEDEN: altta duran "Son Girişler" listesi oturum ilerledikçe uzuyor ve
  // adım değişiminde tarayıcı scroll konumunu koruyor — operatör yeni ürünü
  // seçtiğinde ekran listenin dibinde açılıyor, formu görmek için yukarı
  // kaydırması gerekiyordu. Ürün id'si de bağımlılıkta: aynı adımda ürün
  // değiştirmek de yeni bir sayfa sayılır.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [step, selectedProduct?.id])

  // Mal kabul ekranı açılırken tüm referans veriyi tazele. Bu ekran kesintide
  // çalışmak zorunda; hangi bölgenin açılacağı önceden bilinmediği için
  // hepsinin üreticisi indiriliyor (bkz. prefetchEntryRefData).
  useEffect(() => { prefetchEntryRefData() }, [])
  const [completing, setCompleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [summary, setSummary] = useState(null) // { entryCount, totalCases, totalWeight, producerCount }

  async function openCompleteConfirm() {
    // Önce modalı aç, sonra doldur — tıklamada bekleme olmasın
    setSummary(null)
    setConfirmOpen(true)
    try {
      // Numarasız (offline açılmış) oturumun sunucuda karşılığı yok — özet
      // çekilemez. İstek atıp 400 yemek yerine bilinmiyor olarak gösteriliyor.
      if (!activeSession.id) {
        setSummary(null)
        return
      }
      const list = (await api.getSessionEntries(activeSession.id)) ?? []
      // Bağ/adet kayıtlarında weight SAYI tutuyor — kilo toplamına katılmamalı,
      // yoksa "Toplam kilo" şişer. Üçü ayrı kova (bkz. utils/formatters → sumQty).
      const qty = sumQty(list)
      setSummary({
        entryCount: list.length,
        totalCases: list.reduce((s, e) => s + (e.caseCount ?? 0), 0),
        totalWeight: qty.weight,
        totalBunches: qty.bunches,
        totalPieces: qty.pieces,
        producerCount: new Set(list.map((e) => e.producerId).filter(Boolean)).size,
      })
    } catch {
      setSummary({
        entryCount: '?', totalCases: '?', totalWeight: 0,
        totalBunches: 0, totalPieces: 0, producerCount: '?',
      })
    }
  }

  async function handleComplete() {
    // Oturum sunucuda yoksa kapatılacak bir şey de yok. Kuyruktaki kayıtlar
    // gönderilmeden bölgeyi kapatmak, girişlerin bağlanacağı oturumu erkenden
    // kapatmak demek olurdu.
    if (!activeSession.id) {
      addToast(
        'Bu bölge çevrimdışı açıldı — önce bağlantının gelmesini ve kayıtların ' +
        'gönderilmesini bekleyin, sonra bölgeyi tamamlayın.',
        'error'
      )
      setConfirmOpen(false)
      return
    }
    setCompleting(true)
    try {
      await api.completeRegion(activeSession.id)
      addToast('Bölge tamamlandı ✓')
      completeSession()
    } catch {
      addToast('İşlem başarısız', 'error')
    } finally {
      setCompleting(false)
      setConfirmOpen(false)
      setSummary(null)
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="bg-white border-b border-border px-3 sm:px-4 py-3 sm:py-4 flex flex-wrap items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 order-1">
          {/* Açık bölge oturumu sunucuda kalır — geri dönmek oturumu kapatmaz */}
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg hover:bg-gray-100 text-text-muted shrink-0"
            title="Ana sayfaya dön"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-xl sm:text-2xl shrink-0">🌿</span>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-text-primary leading-none">MAL KABUL</h1>
            {activeSession && (
              <p className="text-xs sm:text-sm text-text-muted mt-1 flex items-center gap-1 flex-wrap">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[120px] sm:max-w-none">{activeSession.region.name}</span>
                {selectedProducer && (
                  <>
                    <span className="text-text-muted/50">·</span>
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate max-w-[120px] sm:max-w-none">{selectedProducer.name}</span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
        <Clock className="shrink-0 order-2 sm:order-3" />
        {activeSession && (
          <button
            type="button"
            onClick={openCompleteConfirm}
            className="justify-center rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed bg-error text-white hover:bg-red-700 active:bg-red-800 px-4 py-2 text-sm flex items-center gap-1.5 sm:gap-2 order-3 sm:order-2 w-full sm:w-auto sm:ml-auto"
          >
            <CheckCircle className="w-4 h-4" />
            Bölge Bitti
          </button>
        )}
      </header>

      <main className="p-4 sm:p-6 max-w-5xl mx-auto">
        {step === 'region_select' && <RegionSelect />}
        {step === 'producer_select' && <ProducerSelect />}
        {step === 'product_select' && <ProductSelect />}
        {step === 'entry_form' && <EntryForm />}

        {/* Son Girişler sunucudan oturum numarasıyla okunuyor. Offline açılan
            bölgede numara henüz yok — liste yerine durumu açıkça söylüyoruz,
            boş liste "hiç giriş yapılmadı" izlenimi verirdi. */}
        {activeSession && step !== 'region_select' && (
          activeSession.id ? (
            <RecentEntriesList sessionId={activeSession.id} />
          ) : (
            <p className="mt-6 text-sm text-text-muted bg-white border border-border rounded-2xl p-4">
              Bu bölge çevrimdışı açıldı. Girdiğiniz satırlar kuyrukta bekliyor;
              bağlantı gelip kayıtlar gönderildikten sonra burada listelenecek.
            </p>
          )
        )}
      </main>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Bölge Bitti — Özet">
        {activeSession && (
          <div className="flex flex-col gap-4">
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-3">
              <p className="font-semibold text-text-primary flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-text-muted" />
                {activeSession.region.name}
              </p>
              <div className="grid grid-cols-3 gap-3 text-text-secondary">
                <div>
                  <p className="text-xs text-text-muted">Mal kabul</p>
                  <p className="text-lg font-bold text-text-primary">{summary?.entryCount ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Toplam kasa</p>
                  <p className="text-lg font-bold text-text-primary">{summary?.totalCases ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Toplam kilo</p>
                  <p className="text-lg font-bold text-text-primary">
                    {summary ? formatWeight(summary.totalWeight) : '—'}
                  </p>
                  {summary?.totalBunches > 0 && (
                    <p className="text-xs text-text-muted">+ {summary.totalBunches} bağ</p>
                  )}
                  {summary?.totalPieces > 0 && (
                    <p className="text-xs text-text-muted">+ {summary.totalPieces} adet</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-text-muted">
                {summary?.producerCount ?? '—'} üreticiden giriş yapıldı
              </p>
            </div>

            {summary?.entryCount === 0 && (
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
                Bu bölgede hiç mal kabul yapılmadı. Yine de kapatılsın mı?
              </p>
            )}

            <p className="text-sm text-text-muted">Bölge tamamlanacak. Bu işlem geri alınamaz.</p>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={completing}>İptal</Button>
              <Button onClick={handleComplete} loading={completing}>Tamamla</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
