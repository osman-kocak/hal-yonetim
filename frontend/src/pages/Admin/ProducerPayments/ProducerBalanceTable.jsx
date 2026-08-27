import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { formatDate } from '@/utils/formatters'
import { formatTL, formatPct } from '@/utils/currency'
import { cn } from '@/utils/cn'
import { ArrowDown, ArrowUp, Users } from 'lucide-react'
import { PAGE_SIZE, balanceTone, isStale } from './constants'

// sort/onSort OPSİYONEL: sıralanamayan kolonlar (Bölge, İşlem) bu prop'ları
// almıyor. `sort.by` diye okumak onlarda undefined'a çarpıp tüm tabloyu
// çökertiyordu — ve boş listede EmptyState döndüğü için hata ancak ilk üretici
// göründüğünde ortaya çıkıyordu.
function Th({ label, sortKey, sort, onSort, align = 'left', title }) {
  const active = sortKey && sort?.by === sortKey
  const Icon = sort?.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th className={cn('p-2 sm:p-3 font-semibold text-text-secondary', align === 'right' ? 'text-right' : 'text-left')} title={title}>
      {sortKey ? (
        <button type="button" onClick={() => onSort(sortKey)}
          className={cn('inline-flex items-center gap-1 hover:text-text-primary', active && 'text-text-primary')}>
          {label}{active && <Icon className="w-3 h-3" />}
        </button>
      ) : label}
    </th>
  )
}

// Kart grid DEĞİL tablo: sekiz metrik karta sığmaz ve bu bir masaüstü muhasebe
// ekranı. Bakiye rengi yalnız KALAN hücresine uygulanıyor — 200 satırlık
// tabloda tam satır boyaması okunmaz hâle getirir.
export function ProducerBalanceTable({
  rows, total, page, setPage, sort, onSort, selected, onToggle, onToggleAll, onPay, onDetail, periodLabel,
}) {
  if (!rows.length) {
    return <EmptyState icon={Users} title="Üretici bulunamadı"
      description="Filtreleri değiştirin ya da 'Sadece bakiyesi olanlar' seçimini kaldırın." />
  }
  const hepsiSecili = rows.length > 0 && rows.every((r) => selected.has(r.id))

  return (
    <div className="flex flex-col gap-3">
      {/* Bu not ŞART: tarih filtresi kolonların bir kısmını daraltıyor ama
          bakiye kümülatif kalıyor. Yazılmazsa muhasebeci geçmiş devri gizli
          sanır ve eksik ödeme yapar. */}
      <p className="text-xs text-text-muted">
        {periodLabel} <strong className="text-text-secondary">Kalan bakiye her zaman toplamdır (devir dahil).</strong>
      </p>

      <div className="bg-white border border-border rounded-2xl shadow-card overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-gray-50 border-b border-border">
            <tr>
              <th className="p-2 sm:p-3 w-10">
                <input type="checkbox" checked={hepsiSecili} onChange={(e) => onToggleAll(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary" title="Bu sayfadakilerin tümünü seç" />
              </th>
              <Th label="Üretici" sortKey="name" sort={sort} onSort={onSort} />
              <Th label="Bölge" />
              <Th label="Hareket" align="right" title="Seçili dönemdeki cari hareket sayısı" />
              <Th label="Mal Bedeli" sortKey="intakeTotal" sort={sort} onSort={onSort} align="right" />
              <Th label="Ödenen" sortKey="paidTotal" sort={sort} onSort={onSort} align="right" />
              <Th label="Kalan" sortKey="balance" sort={sort} onSort={onSort} align="right" />
              <Th label="Son Ödeme" sortKey="lastPaymentAt" sort={sort} onSort={onSort} />
              <Th label="" align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const bayat = isStale(r)
              return (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-2 sm:p-3">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => onToggle(r.id)}
                      className="w-4 h-4 rounded accent-primary" />
                  </td>
                  <td className="p-2 sm:p-3">
                    <button type="button" onClick={() => onDetail(r)}
                      className="font-medium text-text-primary hover:text-primary text-left inline-flex items-center gap-1.5">
                      {/* Uzun süredir hiç ödenmemiş — muhasebenin en pahalı unuttuğu şey */}
                      {bayat && <span className="w-1.5 h-1.5 rounded-full bg-error shrink-0"
                        title={`${new Date(r.lastDebtAt).toLocaleDateString('tr-TR')} tarihinden beri hiç ödeme yapılmamış`} />}
                      {r.name}
                    </button>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {!r.active && <Badge variant="default">Pasif</Badge>}
                      {r.pricePremiumPct ? <Badge variant="warning">{formatPct(r.pricePremiumPct)} prim</Badge> : null}
                      {r.pendingEntryCount > 0 && (
                        <Badge variant="error">{r.pendingEntryCount} fiyatsız</Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-2 sm:p-3 text-text-secondary">
                    {r.allRegions ? <Badge variant="warning">Tüm bölgeler</Badge>
                      : r.regionName ? <Badge variant="primary">{r.regionName}</Badge>
                      : <span className="text-text-muted">—</span>}
                  </td>
                  <td className="p-2 sm:p-3 text-right tabular-nums text-text-muted">{r.movementCount}</td>
                  <td className="p-2 sm:p-3 text-right tabular-nums">{formatTL(r.intakeTotal)}</td>
                  <td className="p-2 sm:p-3 text-right tabular-nums text-green-700">{formatTL(r.paidTotal)}</td>
                  <td className={cn('p-2 sm:p-3 text-right tabular-nums font-bold', balanceTone(r.balance))}>
                    {formatTL(r.balance)}
                    {r.balance < 0 && <div className="text-[10px] font-normal">avans</div>}
                  </td>
                  <td className="p-2 sm:p-3 text-text-secondary whitespace-nowrap">
                    {r.lastPaymentAt ? formatDate(r.lastPaymentAt).slice(0, 10)
                      : <span className="text-error">Hiç ödenmedi</span>}
                  </td>
                  <td className="p-2 sm:p-3 text-right whitespace-nowrap">
                    <div className="inline-flex gap-1">
                      <Button size="sm" onClick={() => onPay(r)}>Öde</Button>
                      <Button size="sm" variant="outline" onClick={() => onDetail(r)}>Detay</Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} hasMore={page * PAGE_SIZE < total} onChange={setPage} />
    </div>
  )
}
