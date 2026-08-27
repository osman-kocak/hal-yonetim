import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { Badge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { formatDate, formatQty, priceLabel } from '@/utils/formatters'
import { formatTL } from '@/utils/currency'
import { Package } from 'lucide-react'
import { PAGE_SIZE, priceSourceMeta } from '../constants'

// Mal kabul dökümü — panelin kalbi.
//
// "Ne aldık, kaça aldık, NEDEN o fiyat" sorusunu tek tabloda cevaplıyor.
// Fiyat kaynağı rozeti olmadan muhasebeci 12,60 TL'nin nereden geldiğini
// tahmin etmek zorunda kalır.
export function IntakeBreakdownTab({ producerId, dateFrom, dateTo }) {
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.getProducerIntakes(producerId, { dateFrom, dateTo, page, limit: PAGE_SIZE })
      .then(setData)
      .finally(() => setLoading(false))
  }, [producerId, dateFrom, dateTo, page])

  if (loading && !data) return <div className="flex justify-center py-12"><LoadingSpinner className="text-primary" /></div>
  if (!data?.data?.length) {
    return <EmptyState icon={Package} title="Mal kabul yok" description="Seçili aralıkta bu üreticiden mal kabul kaydı bulunamadı." />
  }

  const toplam = data.data.reduce((s, r) => s + (r.amount ?? 0), 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-gray-50 border-b border-border">
            <tr>
              <th className="p-2 text-left font-semibold text-text-secondary">Tarih</th>
              <th className="p-2 text-left font-semibold text-text-secondary">Ürün</th>
              <th className="p-2 text-right font-semibold text-text-secondary">Miktar</th>
              <th className="p-2 text-right font-semibold text-text-secondary">Alış Fiyatı</th>
              <th className="p-2 text-left font-semibold text-text-secondary">Kaynak</th>
              <th className="p-2 text-right font-semibold text-text-primary">Tutar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.data.map((r) => {
              const meta = priceSourceMeta(r.purchasePriceSource)
              const Icon = meta.icon
              // Rozet AÇIKLAYICI tooltip taşıyor: kullanıcı rakamı tahmin etmemeli
              const aciklama = r.purchasePriceSource === 'PRODUCER_PREMIUM'
                ? `Genel fiyat üzerine %${r.markupPct} prim uygulandı`
                : r.purchasePriceSource === 'PRODUCER_SPECIAL'
                  ? 'Bu üretici için tanımlı özel alış fiyatı — prim uygulanmadı'
                  : r.purchasePriceSource === 'GENERAL'
                    ? 'Ürünün genel alış fiyatı'
                    : 'Alış fiyatı bulunamadı — borç YAZILMADI'
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="p-2 whitespace-nowrap text-text-secondary">{formatDate(r.createdAt).slice(0, 10)}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-1.5">
                      <span>{r.product.icon || '📦'}</span>
                      <span className="font-medium text-text-primary">{r.product.name}</span>
                    </div>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {/* Etiketler tutarı ETKİLEMEZ ama üretici "zayıf malın
                          parası ödendi mi" diye sorduğunda cevap burada. */}
                      {r.weak && <Badge variant="default">zayıf</Badge>}
                      {r.bQuality && <Badge variant="quality-b">B kalite</Badge>}
                      {r.source === 'DISCARD' && <Badge variant="error">imha</Badge>}
                      {r.market?.no === 99 && r.source !== 'DISCARD' && <Badge variant="error">atılan</Badge>}
                    </div>
                  </td>
                  <td className="p-2 text-right tabular-nums whitespace-nowrap">
                    {formatQty(r.purchaseQty ?? r.weight, r.unit)}
                    {/* Fire / bölünme: alınan miktar ile güncel stok farkı.
                        Borç DEĞİŞMEZ çünkü fire de ödeniyor — ama fark
                        gösterilmezse "97 kg × 12 TL = 1200 TL" çelişkisi çıkar. */}
                    {r.qtyDrift != null && Math.abs(r.qtyDrift) > 0.001 && (
                      <div className="text-[10px] text-text-muted">
                        güncel stok {formatQty(r.weight, r.unit)}
                        {r.qtyDrift < 0 ? ` (${formatQty(Math.abs(r.qtyDrift), r.unit)} fire)` : ''}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {r.purchasePricePerKg != null ? (
                      <>
                        {formatTL(r.purchasePricePerKg)}
                        <div className="text-[10px] text-text-muted">{priceLabel(r.unit)}</div>
                      </>
                    ) : <span className="text-error">—</span>}
                  </td>
                  <td className="p-2">
                    <Badge variant={meta.variant} className="cursor-help" title={aciklama}>
                      <Icon className="w-3 h-3 mr-1" />
                      {r.priceSourceLabel}
                    </Badge>
                  </td>
                  <td className="p-2 text-right tabular-nums font-semibold">
                    {/* OTORİTE ledger kaydı: miktar × fiyat ile yeniden
                        hesaplamak yuvarlama farkı üretir ve düzeltmeleri atlar */}
                    {r.amount != null ? formatTL(r.amount) : <span className="text-error text-xs">borç yazılmadı</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-border">
            <tr>
              <td colSpan={5} className="p-2 text-right font-semibold text-text-secondary">Bu sayfa toplamı</td>
              <td className="p-2 text-right font-bold tabular-nums">{formatTL(toplam)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} hasMore={data.hasMore} onChange={setPage} />
    </div>
  )
}
