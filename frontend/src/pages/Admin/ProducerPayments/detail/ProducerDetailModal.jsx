import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Segmented } from '@/components/ui/Segmented'
import { formatTL, formatPct } from '@/utils/currency'
import { cn } from '@/utils/cn'
import { ScrollText, Package, Banknote } from 'lucide-react'
import { balanceTone } from '../constants'
import { AccountStatementTab } from './AccountStatementTab'
import { IntakeBreakdownTab } from './IntakeBreakdownTab'
import { PaymentHistoryTab } from './PaymentHistoryTab'

const TABS = [
  { value: 'statement', label: 'Hesap Ekstresi', icon: ScrollText },
  { value: 'intakes', label: 'Mal Kabul Dökümü', icon: Package },
  { value: 'payments', label: 'Ödeme Geçmişi', icon: Banknote },
]

// Detay Modal ile açılıyor, ayrı bir Drawer YAZILMADI: Modal zaten className
// kabul ediyor ve HistoryPage aynı deseni kullanıyor (max-w ile genişletme).
export function ProducerDetailModal({ producer, dateFrom, dateTo, onClose, onPay, onChanged }) {
  const [tab, setTab] = useState('statement')

  return (
    <Modal open onClose={onClose} title={null} className="max-w-5xl">
      <div className="flex items-start justify-between gap-4 pb-4 mb-4 border-b border-border">
        <div>
          <h2 className="text-lg font-bold text-text-primary">{producer.name}</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {producer.allRegions ? <Badge variant="warning">Tüm bölgeler</Badge>
              : producer.regionName ? <Badge variant="primary">{producer.regionName}</Badge> : null}
            {producer.pricePremiumPct ? (
              <Badge variant="warning">{formatPct(producer.pricePremiumPct)} alış primi</Badge>
            ) : null}
            {!producer.active && <Badge variant="default">Pasif</Badge>}
            {producer.pendingEntryCount > 0 && (
              <Badge variant="error">{producer.pendingEntryCount} fiyatsız mal kabul</Badge>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-text-muted uppercase tracking-wide">Kalan Bakiye</p>
          <p className={cn('text-2xl font-bold tabular-nums', balanceTone(producer.balance))}>
            {formatTL(producer.balance)}
          </p>
          <Button size="sm" className="mt-2" onClick={() => onPay(producer)}>Ödeme Yap</Button>
        </div>
      </div>

      <Segmented value={tab} onChange={setTab} options={TABS} className="w-fit mb-4" size="sm" />

      {tab === 'statement' && <AccountStatementTab producerId={producer.id} dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === 'intakes' && <IntakeBreakdownTab producerId={producer.id} dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === 'payments' && <PaymentHistoryTab producer={producer} dateFrom={dateFrom} dateTo={dateTo} onChanged={onChanged} />}
    </Modal>
  )
}
