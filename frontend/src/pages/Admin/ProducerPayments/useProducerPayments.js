import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { PAGE_SIZE } from './constants'

// Panel verisi + client-side filtre/sıralama/sayfalama.
//
// Bakiye listesi SAYFASIZ geliyor (üretici sayısı yüzlerle sınırlı). Filtreleme
// ve sıralamayı istemcide yapmanın üç kazancı var:
//   1. Toplu ödeme seçimi sayfalar arası tutarlı kalıyor (Set'te id tutuluyor,
//      sayfa değişince kaybolmuyor)
//   2. Sıralama anında — sunucuya gidip gelmiyor
//   3. Export tüm listeyi zaten elinde tutuyor, fetchAllPages gerekmiyor
export function useProducerPayments() {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [regions, setRegions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    regionId: '', q: '', dateFrom: '', dateTo: '',
    onlyDebt: true,          // varsayılan AÇIK: panelin işi borçluları göstermek
    minBalance: '',
    includeInactive: false,
  })
  const [sort, setSort] = useState({ by: 'balance', dir: 'desc' })
  const [page, setPage] = useState(1)
  const addToast = useToastStore((s) => s.addToast)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Tarih aralığı SUNUCUYA gidiyor: dönemsel toplamlar (mal bedeli/ödenen)
      // orada hesaplanıyor. Bakiye ise her hâlükârda kümülatif dönüyor.
      const params = {}
      if (filters.dateFrom) params.dateFrom = filters.dateFrom
      if (filters.dateTo) params.dateTo = filters.dateTo
      if (filters.includeInactive) params.includeInactive = '1'
      const [b, s] = await Promise.all([
        api.getProducerPaymentBalances(params),
        api.getProducerPaymentSummary(params),
      ])
      setRows(b)
      setSummary(s)
    } catch {
      addToast('Üretici bakiyeleri yüklenemedi', 'error')
    } finally {
      setLoading(false)
    }
  }, [filters.dateFrom, filters.dateTo, filters.includeInactive, addToast])

  useEffect(() => { load() }, [load])
  useEffect(() => { api.getAdminRegions().then(setRegions).catch(() => {}) }, [])
  useEffect(() => { setPage(1) }, [filters.q, filters.regionId, filters.onlyDebt, filters.minBalance])

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    const min = Number(filters.minBalance) || 0
    return rows.filter((r) => {
      if (filters.onlyDebt && !(r.balance > 0)) return false
      if (min && Math.abs(r.balance) < min) return false
      if (filters.regionId && String(r.regionId) !== String(filters.regionId)) return false
      if (q && !r.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, filters])

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      let av = a[sort.by], bv = b[sort.by]
      if (sort.by === 'name') return a.name.localeCompare(b.name, 'tr') * dir
      if (sort.by === 'lastPaymentAt') {
        // Hiç ödenmemiş en üste: 0 değil -Infinity, yoksa "0 TL ödenmiş" ile
        // "hiç ödenmemiş" aynı yere düşer.
        av = a.lastPaymentAt ? new Date(a.lastPaymentAt).getTime() : -Infinity
        bv = b.lastPaymentAt ? new Date(b.lastPaymentAt).getTime() : -Infinity
      }
      return ((av ?? 0) - (bv ?? 0)) * dir
    })
  }, [filtered, sort])

  const paged = useMemo(
    () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sorted, page],
  )

  const toggleSort = useCallback((by) => {
    setSort((s) => s.by === by ? { by, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { by, dir: 'desc' })
  }, [])

  return {
    rows, filtered, sorted, paged, summary, regions, loading,
    filters, setFilters, sort, toggleSort, page, setPage, reload: load,
  }
}
