import { prisma } from '../utils/prismaClient.js'
import { getPriceMap } from './priceController.js'
// Buradaki yerel parsePagination utils/pagination.js'e taşındı — aynı mantık
// beş controller'da daha lazım oldu.
import { parsePagination, paginated } from '../utils/pagination.js'
import { DEPO_NO, DISCARD_NO, findDepoMarket } from '../utils/markets.js'
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
        // Legal fatura eşleştirmesi + baskı durumu: liste satırındaki rozetler
        // ve basılan fişin başlığı bunları okuyor.
        invoiceNo: ex.invoiceNo,
        invoiceAt: ex.invoiceAt,
        invoiceBy: ex.invoiceBy,
        printedAt: ex.printedAt,
        printedBy: ex.printedBy,
        printCount: ex.printCount,
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

// ——— Depo hareket defteri (/admin/depo → "Geçmiş" sekmesi) ———
//
// Cevapladığı soru: "akşam dönüp bakayım — bugün depoya ne girdi, depodan ne
// çıktı, kim yaptı."
//
// NEDEN /admin/transfers YETMEDİ: Transfer tablosu depo hareketlerinin yalnızca
// bir kısmını tutuyor. Mal kabulde DEPO seçilen giriş, ofisten elle açılan kayıt
// ve depoya yazılan iade doğrudan Entry yaratır — Transfer satırı doğmaz. Sadece
// Transfer'e bakan bir geçmiş "bugün depoya 40 kasa domates girdi"yi hiç
// göstermez, yani sorunun yarısını sessizce yutar.
//
// KÖKEN TESPİTİ (kritik): Entry.marketId CANLI konumdur. Depodan çıkan mal artık
// depoda görünmez — "şu an depoda duranlar" bir geçmiş DEĞİLDİR, akşam bakınca
// gün içinde girip çıkan mal listeden silinmiş olur. Bir Entry'nin AÇILDIĞI
// pazar = en eski Transfer'inin fromMarketId'si; hiç transferi yoksa güncel
// marketId. Kayıt sonradan depodan çıkmış olsa da giriş satırı geçmişte kalır.
//
// SAYFALAMA JS TARAFINDA: satırlar iki ayrı tablodan gelip zaman ekseninde
// harmanlanıyor, tek SQL sorgusuyla sayfalanamaz. Bu yüzden aralık HER ZAMAN
// tarihle sınırlı (filtre verilmezse bugün) ve kaynak başına tavan var.
const DEPO_HISTORY_CAP = 5000

// Bir Entry ile ilk Transfer'i arasındaki bu süreden kısa fark, kaydın o
// transferle BİRLİKTE doğduğu anlamına gelir (bkz. isTransferArtifact).
// 5 sn: transaction en yavaş hâlinde bile bunun altında kapanır; gerçek bir
// insan hareketi (malı depoya koy, sonra sevk et) hiçbir zaman bu kadar hızlı
// olmaz.
const SPLIT_WINDOW_MS = 5000

// Bu Entry bir TRANSFER ARTIĞI mı — yani depoya hiç girmemiş, var olan malın
// taşınan yarısı olarak mı doğdu?
//
// createGroupedTransfer ve removeEntryToDepo, KISMÎ aktarmada giden pay için
// aynı transaction içinde YENİ bir Entry + onun Transfer'ini açıyor. Bu kaydın
// "depoda durduğu" bir an hiç olmadı. Zincirden köken çıkarma (en eski
// transferin fromMarketId'si) bunu depo kökenli sanıp GİRİŞ satırı üretiyordu:
// asıl kayıt zaten kendi giriş satırını verdiği için aynı mal gün toplamında
// İKİ KEZ sayılıyordu. Hareketin kendisini zaten Transfer satırı temsil ediyor.
function isTransferArtifact(entry) {
  const first = entry.transfers[0]
  if (!first) return false
  return Math.abs(new Date(first.createdAt) - new Date(entry.createdAt)) < SPLIT_WINDOW_MS
}

// Entry satırının hareket tipi. source tek başına yetmiyor: depodan 99'a
// (imha) transfer edilen kaydın source'u sonradan DISCARD'a çevriliyor
// (bkz. createGroupedTransfer), yani giriş anındaki tip kayboluyor —
// depoya alınmış bir iade sonradan dökülürse "Elle Giriş" görünüyordu.
// regionSessionId ve returnRecord ise hiç değişmiyor.
//
// source === 'RETURN' yedekte kalıyor: ReturnRecord silinince entryId SetNull
// oluyor, o zaman ilişki kopuyor ama source hâlâ doğruyu söylüyor.
function depoEntryType(e) {
  if (e.regionSessionId != null) return 'INTAKE'
  if (e.returnRecord || e.source === 'RETURN') return 'RETURN'
  return 'MANUAL'
}

// "Yapan" — ekranın varlık sebebi bu kolon, boş geçilemez.
// İade Entry'sine createdBy YAZILMIYOR (bkz. writeReturnRow); bilgi
// ReturnRecord'da duruyor. Yazma yolunu değiştirmek yerine burada okunuyor:
// böylece bugüne kadar açılmış iadeler de isimli görünür.
function depoEntryActor(e) {
  return e.createdBy ?? e.returnRecord?.createdBy ?? null
}

export async function getDepoHistory(req, res, next) {
  try {
    const depo = await findDepoMarket()
    if (!depo) return res.status(404).json({ error: 'DEPO market kaydı bulunamadı' })

    // Filtre verilmezse BUGÜN. Filtresiz açılışta tüm geçmişi çekmek hem yavaş
    // hem ekranın amacına aykırı.
    const createdAt = dateRangeFilter(req.query) ?? {
      gte: startOfLocalDay(), lte: endOfLocalDay(),
    }

    const [transfers, entries] = await Promise.all([
      prisma.transfer.findMany({
        where: {
          createdAt,
          OR: [{ fromMarketId: depo.id }, { toMarketId: depo.id }],
        },
        orderBy: { createdAt: 'desc' },
        take: DEPO_HISTORY_CAP + 1,
        include: {
          entry: { include: { product: true, producer: true } },
          fromMarket: { select: { no: true, name: true } },
          toMarket: { select: { no: true, name: true } },
        },
      }),
      prisma.entry.findMany({
        where: {
          createdAt,
          // İki küme: hâlâ depoda duranlar + depodan çıkmış olanlar. İkincisi
          // olmadan gün içinde girip çıkan mal geçmişten kaybolur.
          OR: [
            { marketId: depo.id },
            { transfers: { some: { fromMarketId: depo.id } } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: DEPO_HISTORY_CAP + 1,
        include: {
          product: true,
          producer: true,
          regionSession: { include: { region: true } },
          // Tip tespiti + "Yapan" alanı için (bkz. depoEntryType/depoEntryActor)
          returnRecord: { select: { createdBy: true } },
          // Köken tespiti için yalnızca EN ESKİ transfer lazım (createdAt ile
          // birlikte: kaydın o transferle birlikte doğup doğmadığı okunuyor)
          transfers: { orderBy: { createdAt: 'asc' }, take: 1, select: { fromMarketId: true, createdAt: true } },
        },
      }),
    ])

    const truncated = transfers.length > DEPO_HISTORY_CAP || entries.length > DEPO_HISTORY_CAP
    const rows = []

    for (const t of transfers.slice(0, DEPO_HISTORY_CAP)) {
      const out = t.fromMarketId === depo.id
      rows.push({
        id: `T${t.id}`,
        entryId: t.entryId,
        direction: out ? 'OUT' : 'IN',
        type: out
          ? (t.toMarket?.no === DISCARD_NO ? 'DISCARD' : 'TRANSFER_OUT')
          : 'TRANSFER_IN',
        at: t.createdAt,
        by: t.createdBy,
        productName: t.entry?.product?.name ?? '—',
        caseCount: t.entry?.caseCount ?? 0,
        // Transfer satırında entry'nin miktarı taşınan miktardır: tam transferde
        // weight sevkiyatta tartılan değere güncelleniyor, kısmî transferde
        // giden pay için AYRI entry açılıyor (bkz. createGroupedTransfer).
        weight: t.entry?.weight ?? 0,
        unit: t.entry?.unit ?? 'CASE',
        weak: !!t.entry?.weak,
        disposableCase: !!t.entry?.disposableCase,
        fromMarket: t.fromMarket?.name ?? null,
        toMarket: t.toMarket?.name ?? null,
        producerName: t.entry?.producer?.name ?? null,
        regionName: null,
        note: t.note ?? null,
      })
    }

    for (const e of entries.slice(0, DEPO_HISTORY_CAP)) {
      if (isTransferArtifact(e)) continue // taşınan malın yarısı, yeni bir giriş değil
      const originMarketId = e.transfers[0]?.fromMarketId ?? e.marketId
      if (originMarketId !== depo.id) continue // depoya sonradan uğramış, girişi başka pazarda
      rows.push({
        id: `E${e.id}`,
        entryId: e.id,
        direction: 'IN',
        type: depoEntryType(e),
        at: e.createdAt,
        by: depoEntryActor(e),
        productName: e.product?.name ?? '—',
        // KASA: purchaseCases mal kabul anının donmuş kasa adedi. caseCount
        // canlı stoktur ve kısmî transferde parçadan düşülüyor — bölünmüş bir
        // girişte "kaç kasa girdi" sorusuna eksik cevap verir.
        // ?? caseCount: kolon öncesi açılmış kayıtlarda eski davranışa düşer.
        caseCount: e.purchaseCases ?? e.caseCount,
        // MİKTAR: purchaseQty mal kabul anının donmuş miktarı, weight ise canlı
        // stok (transferde yeniden tartılıyor / bölünüyor). Geçmişte "ne girdi"
        // sorulduğu için snapshot öncelikli.
        weight: e.purchaseQty ?? e.weight,
        unit: e.unit,
        weak: e.weak,
        disposableCase: e.disposableCase,
        fromMarket: null,
        toMarket: depo.name,
        producerName: e.producer?.name ?? null,
        regionName: e.regionSession?.region?.name ?? null,
        note: null,
      })
    }

    rows.sort((a, b) => new Date(b.at) - new Date(a.at))

    // Metin araması JS'te: satırlar zaten bellekte ve arama ürün/kişi/pazar
    // alanlarının hepsini birden tarıyor — iki tabloya ayrı ayrı LIKE yazmak
    // aynı sonucu daha kırılgan üretirdi.
    const q = String(req.query.q ?? '').trim().toLocaleLowerCase('tr')
    const matched = !q ? rows : rows.filter((r) => [
      r.productName, r.by, r.producerName, r.regionName, r.fromMarket, r.toMarket, r.note,
    ].some((v) => v && String(v).toLocaleLowerCase('tr').includes(q)))

    const ins = matched.filter((r) => r.direction === 'IN')
    const outs = matched.filter((r) => r.direction === 'OUT')
    // Kasa toplamında siyah/karton kasa sayılmaz — depo ekranının geri kalanıyla
    // aynı kural (utils/cases.js → trackedCases).
    const summary = {
      in: { count: ins.length, cases: sumTrackedCases(ins), ...sumQty(ins) },
      out: { count: outs.length, cases: sumTrackedCases(outs), ...sumQty(outs) },
    }

    // Yön filtresi ÖZETTEN SONRA: özet gün bakışıdır, "sadece çıkışları göster"
    // dendiğinde günün girişi ekrandan silinmemeli.
    const dir = req.query.direction
    const visible = dir === 'IN' || dir === 'OUT' ? matched.filter((r) => r.direction === dir) : matched

    const pg = parsePagination(req)
    const pageRows = visible.slice(pg.skip, pg.skip + pg.limit)
    res.json({ ...paginated(pageRows, visible.length, pg), summary, truncated })
  } catch (err) { next(err) }
}
