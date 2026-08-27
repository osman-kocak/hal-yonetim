import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { isCountable, priceLabel } from '@/utils/formatters'
import { formatTL } from '@/utils/currency'
import { cn } from '@/utils/cn'
import { TriangleAlert } from 'lucide-react'
import { shortDate } from './usePriceCells'

// Fiyat tablosu. mode HANGİ kolonun düzenlenebilir olduğunu belirler ama her
// iki sekmede de İKİ FİYAT DA gösterilir — marj ancak yan yana anlamlıdır.
//
// Marj kolonu bu ekranın en değerli parçası: alış fiyatı satış fiyatını
// geçtiğinde satır kırmızıya döner ve "yanlışlıkla zararına satış" girişte
// yakalanır, ay sonunda kâr-zarar raporunda değil.
export function PriceGrid({ mode, products, saleCells, purchaseCells, saving, onChange, onChangeList, onBlur }) {
  // Normal (indirim öncesi) fiyat YALNIZ SATIŞ sekmesinde var. Alışta indirim
  // kavramı yok — üreticiye ödenen tutar zaten pazarlıkla belirleniyor ve
  // üretici özel fiyatı o işi görüyor.
  const indirimli = mode === 'sale'
  const editable = mode === 'purchase' ? purchaseCells : saleCells
  const readonly = mode === 'purchase' ? saleCells : purchaseCells
  const editLabel = mode === 'purchase' ? 'Alış' : 'Satış'
  const readLabel = mode === 'purchase' ? 'Satış' : 'Alış'

  return (
    <div className="bg-white border border-border rounded-2xl shadow-card overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead className="bg-gray-50 border-b border-border">
          <tr>
            <th className="p-2 sm:p-4 text-left font-semibold text-text-secondary">Ürün</th>
            {indirimli && (
              <th className="p-2 sm:p-4 text-right font-semibold text-text-secondary">
                Normal Fiyat
                <div className="text-[10px] font-normal text-text-muted">indirim öncesi · boş bırakılabilir</div>
              </th>
            )}
            <th className="p-2 sm:p-4 text-right font-semibold text-text-secondary">
              {indirimli ? 'Net Fiyat' : editLabel}
              {indirimli && <div className="text-[10px] font-normal text-text-muted">fatura bundan kesilir</div>}
            </th>
            <th className="p-2 sm:p-4 text-right font-semibold text-text-muted">{readLabel}</th>
            <th className="p-2 sm:p-4 text-right font-semibold text-text-secondary">Marj</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {products.map((p) => {
            const isSaving = saving === p.id
            const cell = editable[p.id]
            const other = readonly[p.id]
            const sale = Number(mode === 'purchase' ? other?.value : cell?.value)
            const purchase = Number(mode === 'purchase' ? cell?.value : other?.value)
            const bothKnown = Number.isFinite(sale) && Number.isFinite(purchase) && other?.value !== undefined && cell?.value !== undefined
            const margin = bothKnown ? sale - purchase : null
            const marginPct = margin != null && purchase > 0 ? (margin / purchase) * 100 : null

            return (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="p-2 sm:p-4 font-medium text-text-primary">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{p.icon || '📦'}</span>
                    <div className="flex flex-col">
                      <span>{p.name}</span>
                      {/* Bağ/adet ürünlerinde fiyat ₺/kg değil — muhasebeci hangi
                          birime fiyat girdiğini görmeli. */}
                      <span className={cn('text-[10px]', isCountable(p.unit) ? 'text-primary font-semibold' : 'text-text-muted')}>
                        {priceLabel(p.unit)}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Normal fiyat: doldurulursa indirim var demektir; fişte
                    "70 → 50" basılır. Boş bırakılırsa net fiyat zaten normal
                    fiyattır ve fişte tek rakam görünür. */}
                {indirimli && (
                  <td className="p-2 sm:p-3 text-right">
                    <div className="relative inline-flex items-center">
                      <span className="absolute left-2 sm:left-3 text-text-muted text-xs sm:text-sm">₺</span>
                      <input
                        type="number" step="0.01" min="0" placeholder="—"
                        value={cell?.list ?? ''}
                        onChange={(e) => onChangeList(p.id, e.target.value)}
                        onBlur={() => onBlur(p.id, { productId: p.id })}
                        className="w-24 sm:w-32 pl-6 sm:pl-7 pr-2 sm:pr-3 py-2 rounded-lg border border-border text-right text-xs sm:text-sm text-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                  </td>
                )}

                <td className="p-2 sm:p-3 text-right">
                  <div className="inline-flex flex-col items-end gap-0.5">
                    <div className="relative inline-flex items-center">
                      <span className="absolute left-2 sm:left-3 text-text-muted text-xs sm:text-sm">₺</span>
                      <input
                        type="number" step="0.01" min="0" placeholder="—"
                        value={cell?.value ?? ''}
                        onChange={(e) => onChange(p.id, e.target.value)}
                        onBlur={() => onBlur(p.id, { productId: p.id })}
                        className="w-24 sm:w-32 pl-6 sm:pl-7 pr-2 sm:pr-3 py-2 rounded-lg border border-border text-right text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                      {isSaving && (
                        <span className="absolute -right-5 sm:-right-6"><LoadingSpinner size="sm" className="text-primary" /></span>
                      )}
                    </div>
                    {/* Devralınan fiyat: kutudaki rakam geçerli ama bu güne
                        yazılmadı. Tarih olmadan muhasebeci fiyatın güncel mi
                        bayat mı olduğunu ayırt edemez. */}
                    {cell?.inherited && (
                      <span className="text-[10px] text-text-muted pr-1">{shortDate(cell.from)}'tan devir</span>
                    )}
                    {/* İndirim rozeti: muhasebeci listede hangi ürünlerin
                        indirimli olduğunu tek bakışta görsün. */}
                    {indirimli && cell?.list && Number(cell.list) > Number(cell.value) && (
                      <span className="text-[10px] font-semibold text-error pr-1">
                        %{Math.round(((Number(cell.list) - Number(cell.value)) / Number(cell.list)) * 100)} indirim
                      </span>
                    )}
                  </div>
                </td>

                {/* Salt okunur kolon: input DEĞİL düz metin — yanlışlıkla
                    düzenlenip yanlış tabloya yazılmasın. Devir notu ayrı,
                    çünkü alış ve satış farklı günlerden devredebilir. */}
                <td className="p-2 sm:p-3 text-right">
                  <div className="inline-flex flex-col items-end">
                    <span className="tabular-nums text-text-muted">
                      {other?.value !== undefined ? formatTL(Number(other.value)) : '—'}
                    </span>
                    {other?.inherited && (
                      <span className="text-[10px] text-text-muted">{shortDate(other.from)}'tan devir</span>
                    )}
                  </div>
                </td>

                <td className="p-2 sm:p-3 text-right">
                  {margin == null ? (
                    <span className="text-text-muted text-xs">—</span>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      {margin < 0 && (
                        <TriangleAlert className="w-3.5 h-3.5 text-error shrink-0" title="Alış fiyatı satış fiyatından yüksek — zararına satış" />
                      )}
                      <div className="inline-flex flex-col items-end">
                        <span className={cn('font-semibold tabular-nums',
                          margin > 0 ? 'text-green-700' : margin < 0 ? 'text-error' : 'text-text-muted')}>
                          {formatTL(margin)}
                        </span>
                        {marginPct != null && (
                          <span className="text-[10px] text-text-muted tabular-nums">%{marginPct.toFixed(1)}</span>
                        )}
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
