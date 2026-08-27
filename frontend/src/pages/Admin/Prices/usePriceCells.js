import { useCallback, useEffect, useState } from 'react'

const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

// Price.date @db.Date — UTC gün başı olarak gelir. Yerel saate çevirmek gün
// kaymasına yol açar (bkz. backend utils/date.js), bu yüzden UTC bileşenleri
// okunuyor. toLocaleDateString KULLANILMAZ.
export function shortDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d)) return ''
  return `${d.getUTCDate()} ${AYLAR[d.getUTCMonth()]}`
}

// Fiyat hücrelerinin ortak durumu — satış, alış ve üretici özel fiyat sekmeleri
// aynı davranışı paylaşıyor: carry-forward'lı okuma + blur'da kaydetme.
//
// KRİTİK KURAL — `raw === cell.original` ise KAYDETME: devralınan fiyat kutuda
// dolu göründüğü için muhasebeci alanlar arasında gezinirken her blur bir yazma
// tetiklerdi. Fiyat geçmişi "değişmedi" satırlarıyla şişer ve "son güncelleme"
// bilgisi yanıltıcı olur — carry-forward zaten okuma tarafında çalışıyor.
export function usePriceCells({ fetcher, saver, deps = [], keyOf = (p) => p.productId, onError }) {
  const [cells, setCells] = useState({})
  const [saving, setSaving] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let iptal = false
    setLoading(true)
    Promise.resolve(fetcher())
      .then((list) => {
        if (iptal) return
        const map = {}
        for (const p of list ?? []) {
          const value = String(p.pricePerKg)
          // list = NORMAL (indirim öncesi) fiyat. Backend null döndürüyorsa
          // indirim yok demektir; kutu boş kalır ve tek fiyat geçerli olur.
          const list = p.listPricePerKg == null ? '' : String(p.listPricePerKg)
          const cell = {
            id: p.id, value, original: value,
            list, listOriginal: list,
            inherited: p.inherited, from: p.date, cancelled: p.cancelled,
          }
          const k = keyOf(p)
          // Genel satır (qualityId null) kazanır; eski kaliteli satır yalnızca
          // genel yoksa kutuyu doldurur — muhasebeci dünkü rakamı görüp üstüne
          // yazabilsin diye.
          if (p.qualityId == null) map[k] = cell
          else if (map[k] === undefined) map[k] = cell
        }
        setCells(map)
        if (list?.length) {
          const latest = list.reduce((a, b) => (new Date(a.updatedAt) > new Date(b.updatedAt) ? a : b))
          setLastUpdate(latest.updatedAt ? { updatedAt: latest.updatedAt, updatedBy: latest.updatedBy } : null)
        } else setLastUpdate(null)
      })
      .finally(() => { if (!iptal) setLoading(false) })
    return () => { iptal = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const change = useCallback((key, value) => {
    setCells((prev) => ({ ...prev, [key]: { ...prev[key], value } }))
  }, [])

  // Normal (indirim öncesi) fiyat alanı
  const changeList = useCallback((key, list) => {
    setCells((prev) => ({ ...prev, [key]: { ...prev[key], list } }))
  }, [])

  const blur = useCallback(async (key, extra) => {
    const cell = cells[key]
    const raw = cell?.value
    if (raw === '' || raw === undefined) return
    const pricePerKg = parseFloat(raw)
    if (isNaN(pricePerKg) || pricePerKg < 0) return
    const listRaw = cell.list ?? ''
    // İKİ ALAN da değişmediyse kaydetme (bkz. yukarıdaki KRİTİK KURAL).
    // Yalnız `value`ya bakılsaydı normal fiyatı değiştirip net'e dokunmayan
    // kullanıcının indirimi hiç kaydedilmezdi.
    if (raw === cell.original && listRaw === (cell.listOriginal ?? '')) return
    setSaving(key)
    try {
      const saved = await saver({ pricePerKg, listPricePerKg: listRaw === '' ? null : parseFloat(listRaw), ...extra })
      const savedList = saved.listPricePerKg == null ? '' : String(saved.listPricePerKg)
      setCells((prev) => ({
        ...prev,
        [key]: {
          id: saved.id, value: raw, original: raw,
          list: savedList, listOriginal: savedList,
          inherited: false, from: saved.date, cancelled: false,
        },
      }))
      if (saved.updatedAt) setLastUpdate({ updatedAt: saved.updatedAt, updatedBy: saved.updatedBy })
    } catch (e) {
      onError?.(e)
    } finally {
      setSaving(null)
    }
  }, [cells, saver, onError])

  return { cells, setCells, saving, lastUpdate, loading, change, changeList, blur }
}
