import { useCallback, useEffect, useState } from 'react'
import { api } from '@/services/api'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { cn } from '@/utils/cn'
import {
  ResponsiveContainer,
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Package, Scale, FileText, Truck,
  Wallet, AlertTriangle, Users, Store, Calendar,
} from 'lucide-react'

const PERIODS = [
  { key: 'today', label: 'Bugün' },
  { key: 'week', label: 'Bu Hafta' },
  { key: 'month', label: 'Bu Ay' },
]

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#94a3b8']

function formatTL(value) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value ?? 0)
}

function formatNum(value, fractionDigits = 0) {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: fractionDigits }).format(value ?? 0)
}

export function DashboardPage() {
  const [period, setPeriod] = useState('week')
  const [trendDays, setTrendDays] = useState(14)
  const [data, setData] = useState({
    overview: null, trend: [], byDriver: [], byMarket: [], byProduct: [], quality: null,
  })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [overview, trend, byDriver, byMarket, byProduct, quality] = await Promise.all([
        api.getAnalyticsOverview({ period }),
        api.getAnalyticsTrend({ days: trendDays }),
        api.getAnalyticsByDriver({ period, limit: 10 }),
        api.getAnalyticsByMarket({ period, limit: 10 }),
        api.getAnalyticsByProduct({ period, limit: 10 }),
        api.getAnalyticsQuality({ period }),
      ])
      setData({ overview, trend, byDriver, byMarket, byProduct, quality })
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [period, trendDays])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-xl font-bold text-text-primary">📊 Analitik Dashboard</h1>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                period === p.key ? 'bg-white text-text-primary shadow-card' : 'text-text-muted hover:text-text-primary'
              )}
            >
              <Calendar className="w-4 h-4" />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data.overview ? (
        <div className="flex justify-center py-20"><LoadingSpinner size="lg" className="text-primary" /></div>
      ) : (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
            <Kpi label="Giriş" value={formatNum(data.overview?.kpi.entries)} icon={Package} color="primary" />
            <Kpi label="Kasa" value={formatNum(data.overview?.kpi.cases)} icon={Package} color="primary" />
            <Kpi label="Ağırlık" value={formatNum(data.overview?.kpi.weight, 1)} unit="kg" icon={Scale} color="primary" />
            <Kpi label="İrsaliye" value={formatNum(data.overview?.kpi.exits)} icon={FileText} color="primary" />
            <Kpi label="Ciro" value={formatTL(data.overview?.kpi.invoiced)} icon={Wallet} color="green" />
            <Kpi label="Zayıf Mal" value={`%${formatNum(data.overview?.kpi.weakRate, 1)}`} icon={AlertTriangle} color={data.overview?.kpi.weakRate > 10 ? 'red' : 'amber'} />
          </div>

          {/* Bekleyen finans */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
            <Kpi
              label="Bekleyen Alacak (bayilerden)"
              value={formatTL(data.overview?.pending.fromMarkets)}
              icon={TrendingUp}
              color="amber"
              size="lg"
            />
            <Kpi
              label="Bekleyen Borç (üreticilere)"
              value={formatTL(data.overview?.pending.toProducers)}
              icon={TrendingDown}
              color="red"
              size="lg"
            />
          </div>

          {/* Trend Chart */}
          <Card title={`Son ${trendDays} Gün — Giriş & Ciro Trendi`} action={
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg text-xs">
              {[7, 14, 30].map((d) => (
                <button key={d} onClick={() => setTrendDays(d)} className={cn(
                  'px-2 py-1 rounded transition-all',
                  trendDays === d ? 'bg-white shadow-sm' : 'text-text-muted'
                )}>{d}g</button>
              ))}
            </div>
          }>
            {data.trend.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.trend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
                  <YAxis yAxisId="left" stroke="#22c55e" fontSize={12} />
                  <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12 }}
                    formatter={(v, n) => n === 'Ciro' ? formatTL(v) : formatNum(v, 1)}
                  />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="weight" name="Ağırlık (kg)" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="revenue" name="Ciro" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Two-column charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card title="🚛 Top 10 Şoför (Kasa)" subtitle={periodLabel(period)}>
              {data.byDriver.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.byDriver.map((d) => ({ name: d.driver?.name ?? '—', cases: d.cases, weight: d.weight }))} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" stroke="#64748b" fontSize={12} />
                    <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={12} width={100} />
                    <Tooltip contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12 }} />
                    <Bar dataKey="cases" name="Kasa" fill="#22c55e" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="🏪 Top 10 Bayi (Ciro)" subtitle={periodLabel(period)}>
              {data.byMarket.length === 0 ? <EmptyChart message="Bu dönemde fiyatlı irsaliye yok" /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.byMarket.map((m) => ({ name: m.market ? `#${m.market.no} ${m.market.name}` : '—', revenue: m.revenue }))} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" stroke="#64748b" fontSize={12} tickFormatter={(v) => formatTL(v).replace('₺', '')} />
                    <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={11} width={120} />
                    <Tooltip
                      contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12 }}
                      formatter={(v) => formatTL(v)}
                    />
                    <Bar dataKey="revenue" name="Ciro" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="📦 Ürün Dağılımı" subtitle={periodLabel(period)}>
              {data.byProduct.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData(data.byProduct)}
                      dataKey="weight"
                      nameKey="name"
                      cx="50%" cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} %${(percent * 100).toFixed(0)}`}
                      labelLine={false}
                    >
                      {pieData(data.byProduct).map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `${formatNum(v, 1)} kg`} contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="⚠️ Mal Kalitesi" subtitle={periodLabel(period)}>
              {!data.quality || data.quality.total === 0 ? <EmptyChart /> : (
                <div className="flex items-center justify-center h-[280px]">
                  <ResponsiveContainer width="60%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Normal', value: data.quality.normal },
                          { name: 'Zayıf', value: data.quality.weak },
                        ]}
                        dataKey="value"
                        innerRadius={60}
                        outerRadius={100}
                        startAngle={90}
                        endAngle={450}
                      >
                        <Cell fill="#22c55e" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Tooltip contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-2 text-sm ml-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <span className="text-text-muted">Normal:</span>
                      <span className="font-semibold">{data.quality.normal}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="text-text-muted">Zayıf:</span>
                      <span className="font-semibold">{data.quality.weak}</span>
                    </div>
                    <div className="pt-2 border-t mt-2">
                      <p className="text-2xl font-bold text-red-600">%{data.quality.weakRate}</p>
                      <p className="text-xs text-text-muted">zayıf mal oranı</p>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, unit, icon: Icon, color = 'primary', size = 'md' }) {
  const colorMap = {
    primary: 'bg-primary-light text-primary-dark',
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <div className={cn(
      'bg-white border border-border rounded-2xl shadow-card flex items-start gap-3',
      size === 'lg' ? 'p-5' : 'p-4'
    )}>
      {Icon && (
        <div className={cn('rounded-xl p-2 shrink-0', colorMap[color])}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs text-text-muted uppercase tracking-wide truncate">{label}</p>
        <p className={cn('font-bold text-text-primary mt-1 tabular-nums', size === 'lg' ? 'text-2xl' : 'text-xl')}>
          {value}
          {unit && <span className="text-sm font-normal text-text-muted ml-1">{unit}</span>}
        </p>
      </div>
    </div>
  )
}

function Card({ title, subtitle, action, children }) {
  return (
    <div className="bg-white border border-border rounded-2xl shadow-card overflow-hidden mb-4">
      <div className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-text-primary">{title}</h2>
          {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function EmptyChart({ message = 'Veri yok' }) {
  return (
    <div className="flex items-center justify-center h-[280px] text-text-muted text-sm">
      {message}
    </div>
  )
}

function periodLabel(period) {
  return PERIODS.find((p) => p.key === period)?.label ?? ''
}

// Top 5 ürün + "Diğer"
function pieData(byProduct) {
  if (!byProduct?.length) return []
  const top = byProduct.slice(0, 5).map((p) => ({ name: p.product?.name ?? '—', weight: p.weight }))
  const others = byProduct.slice(5).reduce((s, p) => s + (p.weight ?? 0), 0)
  if (others > 0) top.push({ name: 'Diğer', weight: Math.round(others * 100) / 100 })
  return top
}
