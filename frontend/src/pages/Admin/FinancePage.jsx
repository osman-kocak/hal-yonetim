import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ExportButton } from '@/components/ui/ExportButton'
import { formatDate, today } from '@/utils/formatters'
import { cn } from '@/utils/cn'
import { Plus, Trash2, Store, User, Wallet, FileText, TrendingUp, TrendingDown } from 'lucide-react'

const TABS = [
  { key: 'market', label: 'Bayi Cariler', icon: Store },
  { key: 'producer', label: 'Üretici Cariler', icon: User },
  { key: 'report', label: 'Kar-Zarar Raporu', icon: Wallet },
]

const TYPE_META = {
  MARKET_INVOICE:      { label: 'İrsaliye',         variant: 'warning' },
  MARKET_PAYMENT:      { label: 'Tahsilat',         variant: 'success' },
  MARKET_ADJUSTMENT:   { label: 'Bayi Düzeltme',    variant: 'primary' },
  PRODUCER_DEBT:       { label: 'Üretici Borcu',    variant: 'warning' },
  PRODUCER_PAYMENT:    { label: 'Üreticiye Ödeme',  variant: 'success' },
  PRODUCER_ADJUSTMENT: { label: 'Üretici Düzeltme', variant: 'primary' },
}

const MARKET_MANUAL_TYPES = ['MARKET_PAYMENT', 'MARKET_ADJUSTMENT']
const PRODUCER_MANUAL_TYPES = ['PRODUCER_DEBT', 'PRODUCER_PAYMENT', 'PRODUCER_ADJUSTMENT']

function formatTL(value) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value ?? 0)
}

function balanceClasses(balance) {
  if (balance > 0) return 'bg-amber-50 border-amber-200 text-amber-900'
  if (balance < 0) return 'bg-blue-50 border-blue-200 text-blue-900'
  return 'bg-green-50 border-green-200 text-green-900'
}

export function FinancePage() {
  const [tabIdx, setTabIdx] = useState(0)
  const tab = TABS[tabIdx].key

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <Wallet className="w-6 h-6 text-primary" />
          Finans
        </h1>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
        {TABS.map((t, i) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTabIdx(i)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tabIdx === i ? 'bg-white text-text-primary shadow-card' : 'text-text-muted hover:text-text-primary'
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'market' && <LedgerTab scope="market" />}
      {tab === 'producer' && <LedgerTab scope="producer" />}
      {tab === 'report' && <FinancialReportTab />}
    </div>
  )
}

function LedgerTab({ scope }) {
  const isMarket = scope === 'market'
  const [balances, setBalances] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterId, setFilterId] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const fetchBalances = useCallback(() => {
    const fn = isMarket ? api.getMarketLedgerBalances : api.getProducerLedgerBalances
    fn().then(setBalances).catch(() => addToast('Bakiyeler yüklenemedi', 'error'))
  }, [isMarket])

  const fetchEntries = useCallback(() => {
    setLoading(true)
    const params = { scope }
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    if (filterId) params[isMarket ? 'marketId' : 'producerId'] = filterId
    api.getLedger(params)
      .then(setEntries)
      .catch(() => addToast('Hareketler yüklenemedi', 'error'))
      .finally(() => setLoading(false))
  }, [scope, dateFrom, dateTo, filterId, isMarket])

  useEffect(() => { fetchBalances() }, [fetchBalances])
  useEffect(() => { fetchEntries() }, [fetchEntries])

  function refreshAll() { fetchBalances(); fetchEntries() }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteLedgerEntry(deleteTarget.id)
      addToast('Hareket silindi ✓')
      setDeleteTarget(null)
      refreshAll()
    } catch (err) {
      addToast(err.response?.data?.error ?? 'Silinemedi', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const totalPositive = useMemo(() => balances.filter(b => b.balance > 0).reduce((s, b) => s + b.balance, 0), [balances])
  const totalNegative = useMemo(() => balances.filter(b => b.balance < 0).reduce((s, b) => s + b.balance, 0), [balances])

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-border rounded-2xl p-4 shadow-card">
          <p className="text-xs text-text-muted uppercase tracking-wide">
            {isMarket ? 'Toplam Alacak (bayiden)' : 'Toplam Borç (üreticiye)'}
          </p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{formatTL(totalPositive)}</p>
        </div>
        <div className="bg-white border border-border rounded-2xl p-4 shadow-card">
          <p className="text-xs text-text-muted uppercase tracking-wide">Ters Bakiye (avans/fazla)</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{formatTL(Math.abs(totalNegative))}</p>
        </div>
        <div className="bg-white border border-border rounded-2xl p-4 shadow-card">
          <p className="text-xs text-text-muted uppercase tracking-wide">Hareket Sayısı</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{entries.length}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
          {isMarket ? 'Bayi Bakiyeleri' : 'Üretici Bakiyeleri'}
        </h2>
        <div className="flex items-center gap-2">
          <ExportButton
            title={`Finans - ${isMarket ? 'Bayi' : 'Üretici'} Hareketleri`}
            filename={`finans-${isMarket ? 'bayi' : 'uretici'}-${new Date().toISOString().slice(0, 10)}`}
            prepare={() => ({
              columns: ['Tarih', 'Tip', isMarket ? 'Bayi' : 'Üretici', 'Tutar', 'Not', 'Yapan'],
              rows: entries.map((e) => [
                formatDate(e.occurredAt),
                TYPE_META[e.type]?.label ?? e.type,
                isMarket ? (e.market ? `#${e.market.no} ${e.market.name}` : '—') : (e.producer?.name ?? '—'),
                formatTL(e.amount),
                e.note ?? '',
                e.createdBy ?? '',
              ]),
            })}
            disabled={!entries.length}
          />
          <Button onClick={() => setModalOpen(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Yeni Hareket
          </Button>
        </div>
      </div>

      {balances.length === 0 ? (
        <p className="text-sm text-text-muted mb-6">Kayıt yok</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
          {balances.map((b) => (
            <button
              key={b.id}
              onClick={() => setFilterId(String(b.id))}
              className={cn(
                'border rounded-2xl p-3 text-left transition-all hover:shadow-card',
                balanceClasses(b.balance ?? 0),
                String(filterId) === String(b.id) && 'ring-2 ring-primary ring-offset-1'
              )}
            >
              <p className="text-xs font-medium truncate">
                {isMarket ? `#${b.no} ${b.name}` : b.name}
              </p>
              <p className="text-base font-bold mt-1 tabular-nums">{formatTL(b.balance ?? 0)}</p>
            </button>
          ))}
        </div>
      )}

      {filterId && (
        <button
          onClick={() => setFilterId('')}
          className="text-xs text-primary hover:underline mb-2"
        >
          Filtreyi temizle
        </button>
      )}

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Başlangıç</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-border text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Bitiş</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 rounded-xl border border-border text-sm" />
        </div>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-xs text-primary hover:underline">
            Tarihi temizle
          </button>
        )}
      </div>

      <div className="bg-white border border-border rounded-2xl shadow-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" className="text-primary" /></div>
        ) : entries.length === 0 ? (
          <EmptyState icon="💵" title="Hareket yok" description="Filtreyi değiştir veya yeni hareket ekle" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary hidden md:table-cell">Tarih</th>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">Tip</th>
                  <th className="p-2 sm:p-3 text-left font-semibold text-text-secondary">{isMarket ? 'Bayi' : 'Üretici'}</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">Tutar</th>
                  <th className="p-3 text-left font-semibold text-text-secondary hidden lg:table-cell">Not</th>
                  <th className="p-3 text-left font-semibold text-text-secondary hidden lg:table-cell">Yapan</th>
                  <th className="p-2 sm:p-3 text-right font-semibold text-text-secondary">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((e) => {
                  const meta = TYPE_META[e.type] ?? { label: e.type, variant: 'default' }
                  const isAuto = !!e.exitId
                  return (
                    <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-3 whitespace-nowrap text-text-primary hidden md:table-cell">{formatDate(e.occurredAt)}</td>
                      <td className="p-2 sm:p-3">
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                        {isAuto && (
                          <span className="ml-1 sm:ml-2 inline-flex items-center gap-1 text-[10px] sm:text-xs text-text-muted">
                            <FileText className="w-3 h-3" />
                            #{e.exitId}
                          </span>
                        )}
                        <div className="md:hidden text-[10px] text-text-muted mt-1">{formatDate(e.occurredAt)}</div>
                      </td>
                      <td className="p-2 sm:p-3 text-text-primary">
                        {isMarket
                          ? (e.market ? `#${e.market.no} ${e.market.name}` : '—')
                          : (e.producer?.name ?? '—')}
                      </td>
                      <td className="p-2 sm:p-3 text-right font-semibold tabular-nums">
                        <span className={cn(e.amount < 0 ? 'text-blue-700' : 'text-text-primary')}>
                          {formatTL(e.amount)}
                        </span>
                      </td>
                      <td className="p-3 text-text-muted text-xs max-w-xs truncate hidden lg:table-cell">{e.note ?? '—'}</td>
                      <td className="p-3 text-text-muted text-xs hidden lg:table-cell">{e.createdBy ?? '—'}</td>
                      <td className="p-2 sm:p-3 text-right">
                        {!isAuto && (
                          <button onClick={() => setDeleteTarget(e)} className="p-2 rounded-lg hover:bg-red-50 text-error transition-colors" title="Sil">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <LedgerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        scope={scope}
        onSaved={() => { setModalOpen(false); refreshAll() }}
        markets={isMarket ? balances : []}
        producers={isMarket ? [] : balances}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Hareketi Sil"
        description={deleteTarget ? `Bu işlem geri alınamaz. (${TYPE_META[deleteTarget.type]?.label}, ${formatTL(deleteTarget.amount)})` : ''}
      />
    </div>
  )
}

function LedgerModal({ open, onClose, scope, onSaved, markets, producers }) {
  const addToast = useToastStore((s) => s.addToast)
  const isMarket = scope === 'market'
  const availableTypes = isMarket ? MARKET_MANUAL_TYPES : PRODUCER_MANUAL_TYPES

  const [type, setType] = useState(availableTypes[0])
  const [targetId, setTargetId] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [sign, setSign] = useState('+')
  const [note, setNote] = useState('')
  const [occurredAt, setOccurredAt] = useState(today())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setType(availableTypes[0])
    setTargetId('')
    setAmountStr('')
    setSign('+')
    setNote('')
    setOccurredAt(today())
    setError('')
  }, [open, scope])

  async function handleSave() {
    setError('')
    if (!targetId) { setError(isMarket ? 'Bayi seçilmeli' : 'Üretici seçilmeli'); return }
    let v = amountStr.replace(/,/g, '.').replace(/[^0-9.]/g, '')
    const i = v.indexOf('.')
    if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '')
    const a = Number(v)
    if (!Number.isFinite(a) || a <= 0) { setError('Geçerli tutar girin'); return }
    const signedAmount = sign === '−' ? -a : a

    setSaving(true)
    try {
      await api.createLedgerEntry({
        type,
        amount: signedAmount,
        marketId: isMarket ? Number(targetId) : undefined,
        producerId: isMarket ? undefined : Number(targetId),
        note: note.trim() || undefined,
        occurredAt: occurredAt || undefined,
      })
      addToast('Hareket kaydedildi ✓')
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isMarket ? 'Bayi Cari Hareketi' : 'Üretici Cari Hareketi'}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-text-secondary">Hareket Tipi</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-border bg-white text-text-primary text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          >
            {availableTypes.map((t) => (
              <option key={t} value={t}>{TYPE_META[t]?.label ?? t}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-text-secondary">{isMarket ? 'Bayi' : 'Üretici'}</label>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-border bg-white text-text-primary text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          >
            <option value="">Seçin…</option>
            {(isMarket ? markets : producers).map((x) => (
              <option key={x.id} value={x.id}>
                {isMarket ? `#${x.no} ${x.name}` : x.name}
                {' '}(bakiye: {formatTL(x.balance ?? 0)})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Tutar (₺)"
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-secondary">Yön</label>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {['+', '−'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSign(s)}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-base font-semibold transition-all',
                    sign === s
                      ? (s === '+' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')
                      : 'text-text-muted hover:text-text-primary'
                  )}
                >
                  {s} {s === '+' ? 'Ekle' : 'Çıkar'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Input
          label="Tarih"
          type="date"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
        />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-text-secondary">Not (opsiyonel)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full px-4 py-2 rounded-xl border border-border bg-white text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder="Açıklama…"
          />
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
          <Button onClick={handleSave} loading={saving}>Kaydet</Button>
        </div>
      </div>
    </Modal>
  )
}

function FinancialReportTab() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const load = useCallback(() => {
    setLoading(true)
    const params = {}
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    api.getFinancialReport(params)
      .then(setReport)
      .catch(() => addToast('Rapor yüklenemedi', 'error'))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Başlangıç</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-border text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Bitiş</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 rounded-xl border border-border text-sm" />
        </div>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-xs text-primary hover:underline">
            Tarihi temizle
          </button>
        )}
      </div>

      {loading || !report ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" className="text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <ReportCard
              label="Gelir (Tahsilat)"
              value={report.revenue.collected}
              hint={`İrsaliye toplamı: ${formatTL(report.revenue.invoiced)}`}
              color="green"
              icon={TrendingUp}
            />
            <ReportCard
              label="Gider (Üreticiye Ödenen)"
              value={report.expense.paidToProducers}
              hint={`Toplam borç: ${formatTL(report.expense.owedToProducers)}`}
              color="red"
              icon={TrendingDown}
            />
            <ReportCard
              label="Net (Gelir − Gider)"
              value={report.net}
              color={report.net >= 0 ? 'green' : 'red'}
            />
            <ReportCard
              label="Bekleyen Net"
              value={report.pending.fromMarkets - report.pending.toProducers}
              hint={`Alacak ${formatTL(report.pending.fromMarkets)} − Borç ${formatTL(report.pending.toProducers)}`}
              color="blue"
            />
          </div>

          <div className="bg-white border border-border rounded-2xl shadow-card p-6">
            <h3 className="font-semibold text-text-primary mb-4">Detay</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
              <div>
                <p className="text-text-muted mb-2 font-semibold">Bayiler</p>
                <ul className="space-y-1">
                  <li className="flex justify-between"><span>İrsaliye toplamı</span><span className="tabular-nums">{formatTL(report.revenue.invoiced)}</span></li>
                  <li className="flex justify-between"><span>Tahsil edilen</span><span className="tabular-nums text-green-700">{formatTL(report.revenue.collected)}</span></li>
                  <li className="flex justify-between font-semibold pt-2 border-t"><span>Bekleyen alacak</span><span className="tabular-nums text-amber-700">{formatTL(report.pending.fromMarkets)}</span></li>
                </ul>
              </div>
              <div>
                <p className="text-text-muted mb-2 font-semibold">Üreticiler</p>
                <ul className="space-y-1">
                  <li className="flex justify-between"><span>Toplam borç</span><span className="tabular-nums">{formatTL(report.expense.owedToProducers)}</span></li>
                  <li className="flex justify-between"><span>Ödenen</span><span className="tabular-nums text-green-700">{formatTL(report.expense.paidToProducers)}</span></li>
                  <li className="flex justify-between font-semibold pt-2 border-t"><span>Bekleyen borç</span><span className="tabular-nums text-amber-700">{formatTL(report.pending.toProducers)}</span></li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ReportCard({ label, value, hint, color, icon: Icon }) {
  const colorClass = {
    green: 'bg-green-50 border-green-200 text-green-900',
    red: 'bg-red-50 border-red-200 text-red-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
  }[color] ?? 'bg-white border-border text-text-primary'

  return (
    <div className={cn('border rounded-2xl p-4 shadow-card', colorClass)}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="w-4 h-4 opacity-70" />}
        <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      </div>
      <p className="text-2xl font-bold tabular-nums">{formatTL(value)}</p>
      {hint && <p className="text-xs opacity-70 mt-1">{hint}</p>}
    </div>
  )
}
