import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { printIrsaliye, openIrsaliyePdf, isIOS } from '@/store/printStore'
import { generateIrsaliye } from '@/utils/pdfGenerator'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { MarketAutocomplete } from '@/components/ui/Input'
import { formatDate, formatWeight, formatQty, isCountable, priceOf, qtyLabel, sumQty, unitLabel, today } from '@/utils/formatters'
import { ArrowLeft, FileText, Printer, Check, X, Undo2, ArrowRightLeft, AlertTriangle } from 'lucide-react'

const REFRESH_INTERVAL = 10

export function MarketExitDetail() {
  const { marketId } = useParams()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)
  const [createdExit, setCreatedExit] = useState(null)

  const [entries, setEntries] = useState([])
  // Çıkış ekranından kaldırılıp depoya gönderilenler — gri satır olarak kalır,
  // pazara irsaliye kesilince backend bunları döndürmeyi bırakır.
  const [removed, setRemoved] = useState([])
  const [busyEntry, setBusyEntry] = useState(null)
  const [market, setMarket] = useState(null)
  // Tüm pazar listesi — "başka pazara aktar" modalı için gerekli
  const [allMarkets, setAllMarkets] = useState([])
  const [moveTarget, setMoveTarget] = useState(null) // aktarılacak entry
  const [priceMap, setPriceMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)

  async function fetchEntries(isInitial = false) {
    try {
      const [markets, fresh, freshRemoved] = await Promise.all([
        isInitial ? api.getMarkets() : Promise.resolve(null),
        api.getMarketEntries(marketId),
        api.getRemovedEntries(marketId).catch(() => []),
      ])

      if (isInitial && markets) {
        setMarket(markets.find((m) => m.id === Number(marketId)))
        setAllMarkets(markets)
      }

      setEntries(fresh)
      setRemoved(freshRemoved ?? [])

      // Seçim korunur; yalnızca ARTIK LİSTEDE OLMAYAN id'ler atılır. Bu kalemler
      // başka biri tarafından irsaliye edilmiş ya da taşınmış olabilir — sette
      // kalırlarsa irsaliye isteği var olmayan kalemle gider ve 400 döner.
      // Yeni gelenler işaretsiz eklenir, hiçbir şey pre-check edilmez.
      setSelected((prev) => {
        if (!prev.size) return prev
        const alive = new Set(fresh.map((e) => e.id))
        const next = new Set([...prev].filter((id) => alive.has(id)))
        return next.size === prev.size ? prev : next // referans değişmesin, gereksiz render olmasın
      })
      setCountdown(REFRESH_INTERVAL)
    } catch {
      if (isInitial) addToast('Veriler yüklenemedi', 'error')
    } finally {
      if (isInitial) setLoading(false)
    }
  }

  useEffect(() => {
    fetchEntries(true)
    api.getPublicPrices(today()).then(setPriceMap).catch(() => {})
  }, [marketId])

  // Countdown + periyodik yenileme — yalnızca sekme arka plandaysa durur.
  //
  // ESKİDEN seçim varken de duruyordu ("seçim kaybolmasın" diye). Sonucu: operatör
  // ilk kalemi tikler tiklemez liste donuyor, o sırada gelen mallar hiç görünmüyordu
  // (2026-08-13, saha). Seçim zaten kayb olmuyor — fetchEntries yalnızca listeden
  // düşmüş id'leri ayıklıyor, geri kalan işaretli kalıyor.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return // arka planda pause
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchEntries(false)
          return REFRESH_INTERVAL
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [marketId])

  function toggleAll(checked) {
    setSelected(checked ? new Set(entries.map((e) => e.id)) : new Set())
  }

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Kalem depoya döner. Onay diyaloğu yok — işlem geri alınabilir (gri satırdaki
  // "Geri al"), sahada her dokunuşa modal çıkarmak iş yavaşlatıyor.
  async function handleRemove(entry) {
    setBusyEntry(entry.id)
    try {
      await api.removeEntryToDepo(entry.id)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(entry.id)
        return next
      })
      await fetchEntries(false)
      addToast(`${entry.product?.name ?? 'Kalem'} depoya alındı`)
    } catch (err) {
      addToast(err.response?.data?.error ?? 'Kalem kaldırılamadı', 'error')
    } finally {
      setBusyEntry(null)
    }
  }

  // Yanlış pazara yazılmış kalemi doğru pazara aktar. Depoya gönderip oradan
  // tekrar transfer etmeye gerek kalmıyor. Kalem irsaliyeye girmemişse serbest.
  async function handleMoveToMarket(entry, toMarketId, quantity) {
    setBusyEntry(entry.id)
    try {
      await api.removeEntryToDepo(entry.id, toMarketId, quantity)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(entry.id)
        return next
      })
      setMoveTarget(null)
      await fetchEntries(false)
      const t = allMarkets.find((m) => m.id === toMarketId)
      const birim = isCountable(entry.unit) ? unitLabel(entry.unit) : 'kasa'
      addToast(`${quantity} ${birim} ${entry.product?.name ?? ''} → #${t?.no} ${t?.name} aktarıldı`)
    } catch (err) {
      addToast(err.response?.data?.error ?? 'Kalem aktarılamadı', 'error')
    } finally {
      setBusyEntry(null)
    }
  }

  async function handleUndoRemove(transfer) {
    setBusyEntry(transfer.entryId)
    try {
      await api.undoRemoveEntry(transfer.id)
      await fetchEntries(false)
      addToast('Geri alındı ✓')
    } catch (err) {
      addToast(err.response?.data?.error ?? 'Geri alınamadı', 'error')
    } finally {
      setBusyEntry(null)
    }
  }

  async function handleCreateExit() {
    if (market?.isSpecial) {
      addToast(market.no === 0 ? 'Depoya irsaliye kesilemez' : 'İmha pazarına irsaliye kesilemez', 'error')
      return
    }
    if (!selected.size) { addToast('En az bir ürün seçin', 'error'); return }
    setSubmitting(true)
    try {
      const exit = await api.createExit(Number(marketId), [...selected])
      // Burada printIrsaliye() ÇAĞIRMA: iOS Safari await sonrası window.print()'i
      // yok sayar. Kullanıcı sonuç ekranındaki Yazdır'a basmalı (bkz. printStore).
      setCreatedExit(exit)
      addToast('İrsaliye oluşturuldu ✓')
    } catch (err) {
      addToast(err.response?.data?.error ?? 'İrsaliye oluşturulamadı', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    )
  }

  // İrsaliye kesildi → yazdırma bu ekrandan, doğrudan dokunuşla tetiklenir
  if (createdExit) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-border rounded-2xl shadow-card p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-text-primary">İrsaliye #{createdExit.id} oluşturuldu</h1>
          <p className="text-sm text-text-muted mt-2">
            #{createdExit.market?.no} {createdExit.market?.name} · {createdExit.items?.length ?? 0} kalem
          </p>

          <div className="flex flex-col gap-3 mt-6">
            <Button size="lg" onClick={() => printIrsaliye(createdExit)} className="w-full flex items-center justify-center gap-2">
              <Printer className="w-5 h-5" />
              Yazdır
            </Button>
            {/* iPad'de Yazdır doğrudan AirPrint panelini açar. Açılmazsa PDF
                yedeği hemen altta — kullanıcı hiçbir durumda tıkanmasın. */}
            {isIOS() && (
              <p className="-mt-1 text-xs text-text-muted">
                Yazdırma paneli açılmazsa <strong>PDF olarak aç</strong>ı kullan
              </p>
            )}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => (isIOS() ? openIrsaliyePdf(createdExit) : generateIrsaliye(createdExit))}
                className="flex-1 flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" />
                {isIOS() ? 'PDF olarak aç' : 'PDF'}
              </Button>
              <Button variant="outline" onClick={() => navigate('/cikis')} className="flex-1">
                Listeye dön
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Özel pazarlar (DEPO=0, ATILAN=99) için irsaliye kesilemez — bilgilendir
  if (market?.isSpecial) {
    return (
      <div className="min-h-screen bg-bg">
        <header className="bg-white border-b border-border px-4 py-4">
          <div className="max-w-5xl mx-auto flex items-center gap-4">
            <button onClick={() => navigate('/cikis')} className="p-2 rounded-lg hover:bg-gray-100 text-text-muted">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-text-primary">{market.name}</h1>
          </div>
        </header>
        <main className="p-4 sm:p-6 max-w-5xl mx-auto">
          {market.no === 0 ? (
            <EmptyState
              icon="📦"
              title="Depoya irsaliye kesilemez"
              description="Depo bir pazar değil — buradaki ürünleri pazarlara aktarmak için Depo Transfer sayfasını kullan."
              action={<Button onClick={() => navigate('/depo')}>Depo Transfer'e git</Button>}
            />
          ) : (
            <EmptyState
              icon="🗑"
              title="İmha pazarına irsaliye kesilemez"
              description="Buradaki mallar imha edilmiş (fire) kayıtlardır. Özetini görmek için Fire / İmha raporunu kullan."
              action={<Button onClick={() => navigate('/admin/fire')}>Fire raporuna git</Button>}
            />
          )}
        </main>
      </div>
    )
  }

  const selectedEntries = entries.filter((e) => selected.has(e.id))
  const totalCases = selectedEntries.reduce((s, e) => s + e.caseCount, 0)
  // Bağ/adet kalemlerinde weight sayı tutuyor — kilo toplamına karışmamalı,
  // bağ ile adet de birbirine eklenmemeli.
  const {
    weight: totalWeight, bunches: totalBunches, pieces: totalPieces,
  } = sumQty(selectedEntries)
  const weakSelected = selectedEntries.filter((e) => e.weak).length

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-white border-b border-border px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/cikis')} className="p-2 rounded-lg hover:bg-gray-100 text-text-muted">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-text-primary leading-none">
                {market ? `Pazar #${market.no} — ${market.name}` : 'Pazar'}
              </h1>
              <p className="text-sm text-text-muted">{entries.length} bekleyen giriş</p>
            </div>
          </div>
          {/* Countdown */}
          <span className="text-xs text-text-muted bg-gray-100 rounded-full px-3 py-1 tabular-nums">
            🔄 {countdown}s
          </span>
        </div>
      </header>

      <main className="p-4 sm:p-6 max-w-5xl mx-auto">
        {/* Tüm kalemler kaldırılmışsa tablo yine görünmeli — gri satırlar orada */}
        {!entries.length && !removed.length ? (
          <EmptyState
            icon="✅"
            title="Bu pazarda bekleyen giriş yok"
            description="Tüm girişler irsaliye edilmiş"
            action={<Button variant="outline" onClick={() => navigate('/cikis')}>Geri Dön</Button>}
          />
        ) : (
          <>
            <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-card mb-6">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-gray-50 border-b border-border">
                  <tr>
                    <th className="p-2 sm:p-4 text-left w-10 sm:w-12">
                      <input
                        type="checkbox"
                        checked={selected.size > 0 && selected.size === entries.length}
                        onChange={(e) => toggleAll(e.target.checked)}
                        className="w-4 h-4 rounded accent-primary"
                      />
                    </th>
                    <th className="p-2 sm:p-4 text-left font-semibold text-text-secondary">Ürün</th>
                    {/* Bir pazarda kilo, bağ ve adet kalemleri karışabilir —
                        başlıklar birimsiz, hücreler kendi birimini yazıyor. */}
                    <th className="p-2 sm:p-4 text-right font-semibold text-text-secondary">Kasa</th>
                    <th className="p-2 sm:p-4 text-right font-semibold text-text-secondary hidden sm:table-cell">Miktar</th>
                    <th className="p-4 text-right font-semibold text-text-secondary hidden md:table-cell">Birim Fiyat</th>
                    <th className="p-4 text-left font-semibold text-text-secondary hidden lg:table-cell">Tarih</th>
                    <th className="p-2 sm:p-4 text-right font-semibold text-text-secondary w-16">Kaldır</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.map((entry) => (
                    <tr
                      key={entry.id}
                      onClick={() => toggle(entry.id)}
                      className={`cursor-pointer transition-colors ${
                        entry.weak ? 'bg-error/5 hover:bg-error/10' : 'hover:bg-primary-light/30'
                      }`}
                    >
                      <td className="p-4">
                        <input
                          type="checkbox"
                          checked={selected.has(entry.id)}
                          onChange={() => toggle(entry.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded accent-primary"
                        />
                      </td>
                      <td className="p-2 sm:p-4 font-medium text-text-primary">
                        <div className="flex flex-col">
                          <span className="flex items-center gap-1.5">
                            {entry.product?.name ?? '—'}
                            {/* Mal kabulde zayıf işaretlenmişti — yükleyen görsün.
                                Teslim fişine BASILMAZ (bkz. pdfGenerator/IrsaliyePrint). */}
                            {entry.weak && (
                              <Badge variant="error" className="inline-flex items-center gap-1 text-[10px] py-0 px-1.5">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Zayıf
                              </Badge>
                            )}
                          </span>
                          <span className="sm:hidden text-[10px] text-text-muted">
                            {formatQty(entry.weight, entry.unit)}
                            {priceOf(priceMap, entry.productId, entry.qualityId) != null &&
                              ` · ₺${Number(priceOf(priceMap, entry.productId, entry.qualityId)).toFixed(2)}/${unitLabel(entry.unit)}`}
                          </span>
                        </div>
                      </td>
                      <td className="p-2 sm:p-4 text-right text-text-primary tabular-nums">
                        {entry.caseCount}
                      </td>
                      <td className="p-2 sm:p-4 text-right text-text-primary tabular-nums hidden sm:table-cell">
                        {formatQty(entry.weight, entry.unit)}
                      </td>
                      <td className="p-4 text-right text-text-muted hidden md:table-cell">
                        {priceOf(priceMap, entry.productId, entry.qualityId) != null
                          ? `₺${Number(priceOf(priceMap, entry.productId, entry.qualityId)).toFixed(2)}`
                          : '—'}
                      </td>
                      <td className="p-4 text-text-muted hidden lg:table-cell">{formatDate(entry.createdAt)}</td>
                      <td className="p-2 sm:p-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setMoveTarget(entry) }}
                          disabled={busyEntry === entry.id}
                          title="Başka pazara aktar"
                          className="p-2 rounded-lg text-text-muted hover:bg-primary-light hover:text-primary-dark disabled:opacity-40 transition-colors"
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleRemove(entry) }}
                          disabled={busyEntry === entry.id}
                          title="Depoya geri gönder"
                          className="p-2 rounded-lg text-text-muted hover:bg-error/10 hover:text-error disabled:opacity-40 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {/* Kaldırılanlar: irsaliye kesilene kadar gri kalır, fişe girmez */}
                  {removed.map((t) => (
                    <tr key={`removed-${t.id}`} className="bg-gray-50 text-text-muted">
                      <td className="p-4 text-center">
                        <X className="w-4 h-4 mx-auto opacity-40" />
                      </td>
                      <td className="p-2 sm:p-4">
                        <div className="flex flex-col">
                          <span className="line-through">{t.entry?.product?.name ?? '—'}</span>
                          <span className="text-[10px] leading-tight">
                            {t.toMarket?.no === 0
                              ? 'Depoya alındı'
                              : `#${t.toMarket?.no} ${t.toMarket?.name} pazarına aktarıldı`}
                            {' · '}{t.createdBy ?? '—'} · {formatDate(t.createdAt)}
                          </span>
                        </div>
                      </td>
                      <td className="p-2 sm:p-4 text-right tabular-nums line-through">
                        {t.entry?.caseCount}
                      </td>
                      <td className="p-2 sm:p-4 text-right tabular-nums line-through hidden sm:table-cell">
                        {formatQty(t.entry?.weight ?? 0, t.entry?.unit)}
                      </td>
                      <td className="p-4 text-right hidden md:table-cell">—</td>
                      <td className="p-4 hidden lg:table-cell">{formatDate(t.entry?.createdAt)}</td>
                      <td className="p-2 sm:p-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleUndoRemove(t)}
                          disabled={busyEntry === t.entryId}
                          title="Geri al — kalem pazara döner"
                          className="p-2 rounded-lg text-text-muted hover:bg-primary-light hover:text-primary-dark disabled:opacity-40 transition-colors"
                        >
                          <Undo2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-border rounded-2xl p-5 shadow-card">
              <div className="flex gap-6">
                <div>
                  <p className="text-xs text-text-muted">Seçili Kasa</p>
                  <p className="text-xl font-bold text-text-primary">{totalCases}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Seçili Ağırlık</p>
                  <p className="text-xl font-bold text-text-primary">{formatWeight(totalWeight)}</p>
                  {totalBunches > 0 && (
                    <p className="text-xs text-text-muted">+ {totalBunches} bağ</p>
                  )}
                  {totalPieces > 0 && (
                    <p className="text-xs text-text-muted">+ {totalPieces} adet</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-text-muted">Seçili Kalem</p>
                  <p className="text-xl font-bold text-text-primary">{selected.size}</p>
                </div>
                {/* Fişe basılmıyor; yükleme sırasında bilinmesi için burada */}
                {weakSelected > 0 && (
                  <div>
                    <p className="text-xs text-text-muted">Zayıf</p>
                    <p className="text-xl font-bold text-error">{weakSelected}</p>
                  </div>
                )}
              </div>
              <Button
                size="xl"
                onClick={handleCreateExit}
                loading={submitting}
                disabled={!selected.size}
                className="flex items-center gap-2"
              >
                <FileText className="w-5 h-5" />
                İrsaliye Oluştur
              </Button>
            </div>
          </>
        )}
      </main>

      <MoveEntryModal
        key={moveTarget?.id ?? 'none'}
        entry={moveTarget}
        // Depo ve İmha hariç — depoya göndermek için satırdaki X butonu var,
        // imha ayrı akış (backend de 99'u reddediyor).
        markets={allMarkets.filter((m) => !m.isSpecial && m.id !== Number(marketId))}
        busy={busyEntry === moveTarget?.id}
        onClose={() => setMoveTarget(null)}
        onConfirm={(toMarketId, quantity) => handleMoveToMarket(moveTarget, toMarketId, quantity)}
      />
    </div>
  )
}

// Yanlış pazara yazılan kalemi doğru pazara aktarır. Pazar NO'su yazılarak
// seçilir — mal kabul ve depo transferle aynı alışkanlık.
function MoveEntryModal({ entry, markets, busy, onClose, onConfirm }) {
  // Form sıfırlaması effect'le değil, çağıran taraftaki key ile: her yeni kalemde
  // bileşen remount olur, state kendiliğinden temizlenir.
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  // Miktar ekseni birime bağlı: kiloda kasa adedi, bağ/adette birimin sayısı.
  const countable = isCountable(entry?.unit)
  const total = entry ? (countable ? entry.weight : entry.caseCount) : 0
  const birim = countable ? unitLabel(entry?.unit) : 'kasa'
  // Varsayılan tamamı — çoğu düzeltme kalemin bütününü taşıyor
  const [qty, setQty] = useState(String(total))

  const selected = markets.find((m) => m.id === selectedId)
  const qtyNum = Number(qty)
  const qtyValid = Number.isInteger(qtyNum) && qtyNum > 0 && qtyNum <= total
  const kalan = qtyValid ? total - qtyNum : null

  return (
    <Modal open={!!entry} onClose={onClose} title="Başka pazara aktar">
      {entry && (
        <div className="flex flex-col gap-4">
          <div className="bg-gray-50 rounded-xl p-3 text-sm">
            <p className="font-semibold text-text-primary">
              {entry.product?.name ?? '—'}
              {entry.weak && <span className="ml-2 text-xs text-error font-medium">(Zayıf)</span>}
            </p>
            <p className="text-xs text-text-muted mt-1">
              {countable
                ? `${entry.caseCount} kasa · ${formatQty(entry.weight, entry.unit)}`
                : `${entry.caseCount} kasa · ${formatWeight(entry.weight)}`}
            </p>
          </div>

          <div className="flex gap-3 items-start">
            <div className="flex-1">
              <MarketAutocomplete
                label="Hedef Pazar No"
                markets={markets}
                value={query}
                onChange={setQuery}
                onSelect={(m) => setSelectedId(m?.id ?? null)}
              />
              {query && (
                <p className={`text-xs mt-1 ${selected ? 'text-primary font-medium' : 'text-error'}`}>
                  {selected ? selected.name : 'Böyle bir pazar yok'}
                </p>
              )}
            </div>
            {/* Kalemin tamamı değil bir kısmı aktarılabilsin */}
            <div className="w-28">
              <label className="text-sm font-medium text-text-secondary">
                {countable ? qtyLabel(entry?.unit) : 'Kasa'}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
                className={`w-full mt-1 px-4 py-3 rounded-xl border bg-white text-text-primary text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary ${
                  qty && !qtyValid ? 'border-error' : 'border-border'
                }`}
              />
              <p className={`text-xs mt-1 ${qty && !qtyValid ? 'text-error font-semibold' : 'text-text-muted'}`}>
                en fazla {total}
              </p>
            </div>
          </div>

          {/* Kısmî aktarmada kalem bölünür — kullanıcı sonucu önceden görsün */}
          {qtyValid && kalan > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-text-secondary">
              Kalem bölünecek: <strong className="text-primary">{qtyNum} {birim}</strong> aktarılacak,{' '}
              <strong>{kalan} {birim}</strong> bu pazarda kalacak.
              {countable ? ' Kasa aynı oranda ayrılır.' : ' Kilo aynı oranda ayrılır.'}
            </div>
          )}

          <p className="text-xs text-text-muted">
            Kalem irsaliyeye girmediği için kasa ve cari hesap etkilenmez.
            Yanlış olursa bu ekranda gri satır olarak kalır, oradan geri alınabilir.
          </p>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>İptal</Button>
            <Button
              onClick={() => onConfirm(selectedId, qtyNum)}
              loading={busy}
              disabled={!selectedId || !qtyValid}
            >
              Aktar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
