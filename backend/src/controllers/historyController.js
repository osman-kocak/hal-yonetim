import { prisma } from '../utils/prismaClient.js'
import { getPriceMap } from './priceController.js'
// Buradaki yerel parsePagination utils/pagination.js'e taşındı — aynı mantık
// beş controller'da daha lazım oldu.
import { parsePagination } from '../utils/pagination.js'
import { DEPO_NO } from '../utils/markets.js'
import { startOfLocalDay, endOfLocalDay } from '../utils/date.js'
import { sumQty } from '../utils/units.js'
import { priceOf } from '../utils/prices.js'
import { sumTrackedCases } from '../utils/cases.js'
import { marketSummaries } from '../utils/marketSummary.js'

// Tarih aralığı filtresi. `date` (tek gün) eski parametre — tarayıcıda önbelleğe
// alınmış eski frontend bundle'ı hâlâ onu gönderebiliyor, o yüzden korunuyor.
// startOfLocalDay/endOfLocalDay şart: new Date('2026-08-08') UTC gece yarısıdır,
// TR'de üst sınır 20:59'a düşüp günün son 3 saati filtreden kaybolur.
function dateRangeFilter({ date, dateFrom, dateTo }) {
  const from = dateFrom || date
  const to = dateTo || date
  if (!from && !to) return undefined
  const range = {}
  if (from) range.gte = startOfLocalDay(from)
  if (to) range.lte = endOfLocalDay(to)
  return range
}

// Tüm irsaliyeleri getir (filtre: tarih, market) — paginated
export async function getExitHistory(req, res, next) {
  try {
    const { marketId, exitId } = req.query
    const { page, limit, skip } = parsePagination(req)
    const where = {}

    // Fiş no ile arama: tarih ve pazar filtrelerini EZER. Amaç "elimdeki fişi
    // bul ve tekrar bas" — kullanıcı fişin tarihini bilmek zorunda kalmasın.
    const wantedId = Number(exitId)
    if (exitId && Number.isInteger(wantedId) && wantedId > 0) {
      where.id = wantedId
    } else {
      const createdAt = dateRangeFilter(req.query)
      if (createdAt) where.createdAt = createdAt
      if (marketId) where.marketId = Number(marketId)
    }

    const [exits, total] = await Promise.all([
      prisma.exit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          market: true,
          items: {
            include: {
              entry: {
                include: {
                  product: true,
                  producer: true,
                  quality: true,
                  regionSession: { include: { region: true } },
                },
              },
            },
          },
        },
      }),
      prisma.exit.count({ where }),
    ])

    // Unique tarihler için fiyat map'lerini paralel çek
    const uniqueDates = [...new Set(exits.map((e) => e.createdAt.toISOString().split('T')[0]))]
    const priceMaps = {}
    await Promise.all(
      uniqueDates.map(async (d) => { priceMaps[d] = await getPriceMap(new Date(d)) })
    )

    // İrsaliye başlığındaki bayi özeti (kasa bakiyesi + borç). Sayfadaki tüm
    // pazarlar tek turda çekiliyor — pazar başına sorgu N+1 olurdu.
    // Geçmişten yeniden basılan fiş BUGÜNKÜ bakiyeyi gösterir; fişin kesildiği
    // andaki değer saklanmıyor (bkz. utils/marketSummary.js).
    const summaries = await marketSummaries(exits.map((ex) => ex.marketId))

    const data = exits.map((ex) => {
      const priceMap = priceMaps[ex.createdAt.toISOString().split('T')[0]] ?? {}
      const itemsWithPrice = ex.items.map((item) => {
        // Snapshot önceliği — ExitItem.pricePerKg saklı varsa onu kullan
        const pricePerKg = item.pricePerKg != null
          ? item.pricePerKg
          : priceOf(priceMap, item.entry.productId, item.entry.qualityId)
        const totalPrice = pricePerKg !== null ? pricePerKg * item.entry.weight : null
        return { ...item, pricePerKg, totalPrice }
      })
      const qty = sumQty(ex.items, (i) => i.entry)
      return {
        id: ex.id,
        createdAt: ex.createdAt,
        createdBy: ex.createdBy,
        editedAt: ex.editedAt,
        editedBy: ex.editedBy,
        market: ex.market,
        itemCount: ex.items.length,
        totalCases: ex.items.reduce((s, i) => s + i.entry.caseCount, 0),
        // totalCases HAM toplam (siyah/karton dahil) — ekrandaki liste bunu
        // kullanıyor. İrsaliye başlığı ise trackedCases basar: bakiyeye giren
        // sayı odur, ikisi karışırsa bayi "40 kasa aldım ama borcum 32 arttı"
        // der. Bkz. utils/cases.js.
        trackedCases: sumTrackedCases(ex.items, (i) => i.entry),
        marketCaseBalance: summaries[ex.marketId]?.caseBalance ?? 0,
        marketDebt: summaries[ex.marketId]?.debt ?? 0,
        // Bir irsaliyede kilo, bağ ve adet kalemleri karışabilir; weight kolonu
        // üç birimde farklı şey tuttuğu için tek toplamda birleştirilemez.
        // Bağ ile adet de birbirine eklenmez — toplanabilir sayı değiller.
        totalWeight: qty.weight,
        totalBunches: qty.bunches,
        totalPieces: qty.pieces,
        regions: [...new Set(ex.items.map((i) => i.entry.regionSession?.region?.name).filter(Boolean))],
        items: itemsWithPrice,
      }
    })

    res.json({ data, total, page, limit, hasMore: skip + data.length < total })
  } catch (err) { next(err) }
}

// Tüm giriş kayıtları — paginated
export async function getEntryHistory(req, res, next) {
  try {
    const { regionId, marketId, producerId } = req.query
    const { page, limit, skip } = parsePagination(req)
    const where = {}

    const createdAt = dateRangeFilter(req.query)
    if (createdAt) where.createdAt = createdAt
    if (regionId) where.regionSession = { regionId: Number(regionId) }
    if (marketId) where.marketId = Number(marketId)
    // Üretici filtresi bölgeden BAĞIMSIZ uygulanır: üretici allRegions ise ya da
    // bölgesi sonradan değiştiyse, kayıtları başka bölgenin oturumunda durabilir.
    // İkisini AND'lemek o kayıtları sessizce gizlerdi.
    if (producerId) where.producerId = Number(producerId)

    const [entries, total] = await Promise.all([
      prisma.entry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          product: true,
          producer: true,
          quality: true,
          market: true,
          regionSession: { include: { region: true } },
          exitItems: { include: { exit: true } },
          // Depodan çıkış izi. Mal kabulde DEPO'ya yazılan mal sonradan
          // transferle pazara gidiyor; export'ta "bu mal depodan mı geçti"
          // sorusunun cevabı yalnızca burada.
          transfers: {
            include: { fromMarket: true, toMarket: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      prisma.entry.count({ where }),
    ])

    const data = entries.map((e) => {
      // Depodan pazara aktarma. Bir kalem birden çok kez taşınmış olabilir
      // (depoya geri al → tekrar gönder); geçerli olan SONUNCUSU, çünkü kaydın
      // şu anki pazarını o belirledi.
      const depoOut = e.transfers
        .filter((t) => t.fromMarket?.no === DEPO_NO && t.toMarket?.no !== DEPO_NO)
        .at(-1) ?? null

      return {
      id: e.id,
      createdAt: e.createdAt,
      region: e.regionSession?.region ?? null,
      sessionId: e.regionSessionId,
      product: e.product,
      producer: e.producer,
      quality: e.quality,
      market: e.market,
      caseCount: e.caseCount,
      weight: e.weight,
      weak: e.weak,
      // Admin bu ekrandan siyah kasa işaretini düzeltebiliyor; source da
      // (mal kabul / iade / imha) export sekmelerinde ayrım için lazım.
      disposableCase: e.disposableCase,
      // Yalnızca etiket (kasa/fiyat etkisi yok) ama export'ta sütunu var —
      // yanıt açıkça alan seçtiği için burada listelenmesi şart.
      bQuality: e.bQuality,
      unit: e.unit,
      source: e.source,
        exitedAt: e.exitItems[0]?.exit?.createdAt ?? null,
        irsaliyeId: e.exitItems[0]?.exitId ?? null,
        // null → mal kabulde doğrudan pazara yazılmış, depoya hiç uğramamış
        depoTransfer: depoOut && {
          at: depoOut.createdAt,
          toMarket: depoOut.toMarket
            ? { no: depoOut.toMarket.no, name: depoOut.toMarket.name }
            : null,
          by: depoOut.createdBy,
          note: depoOut.note, // fire varsa "Tartı farkı: -X kg" burada
        },
      }
    })

    res.json({ data, total, page, limit, hasMore: skip + data.length < total })
  } catch (err) { next(err) }
}
