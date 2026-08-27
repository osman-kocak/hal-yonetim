import { StatCard } from '@/components/ui/StatCard'
import { formatTL } from '@/utils/currency'
import { Wallet, TrendingDown, TrendingUp, Users, TriangleAlert } from 'lucide-react'

// Panelin üst şeridi.
//
// KRİTİK AYRIM (koda ve ekrana yazılı): "Toplam ödenmemiş borç" KÜMÜLATİFTİR,
// tarih filtresinden etkilenmez. "Dönem içi" kartları filtreye tabidir. İkisi
// karışırsa muhasebeci "bu ay 5.000 borç, 5.000 ödendi → bakiye 0" sanır ve
// geçmiş devri hiç görmez.
export function SummaryCards({ summary, onShowDebtors, onShowUnpriced, onShowPayments }) {
  if (!summary) return null
  const donemli = summary.period.dateFrom || summary.period.dateTo

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
      <StatCard
        label="Ödenmemiş Borç" tone="amber" icon={Wallet}
        value={formatTL(summary.totalOutstanding)}
        sub="Tüm zamanlar (devir dahil)"
        onClick={onShowDebtors}
      />
      <StatCard
        label={donemli ? 'Dönem İçi Mal Bedeli' : 'Toplam Mal Bedeli'} tone="blue" icon={TrendingUp}
        value={formatTL(summary.periodIntake)}
        sub={donemli ? 'Seçili tarih aralığı' : 'Tüm zamanlar'}
      />
      <StatCard
        label={donemli ? 'Dönem İçi Ödenen' : 'Toplam Ödenen'} tone="green" icon={TrendingDown}
        value={formatTL(summary.periodPaid)}
        sub={donemli ? 'Seçili tarih aralığı' : 'Tüm zamanlar'}
        onClick={onShowPayments}
      />
      <StatCard
        label="Bakiyesi Olan" icon={Users}
        value={summary.producersWithBalance}
        sub={summary.totalAdvance > 0 ? `${formatTL(summary.totalAdvance)} avans verilmiş` : 'üretici'}
        onClick={onShowDebtors}
      />
      <StatCard
        label="Fiyatsız Mal Kabul"
        tone={summary.unpricedEntryCount > 0 ? 'red' : 'neutral'}
        icon={TriangleAlert}
        value={summary.unpricedEntryCount}
        sub={summary.unpricedEntryCount > 0
          ? `${summary.unpricedProductCount} üründe fiyat yok — borç YAZILMADI`
          : 'tüm girişlerin fiyatı var'}
        onClick={summary.unpricedEntryCount > 0 ? onShowUnpriced : undefined}
      />
    </div>
  )
}
