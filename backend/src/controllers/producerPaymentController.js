// ÜRETİCİ ÖDEME PANELİ — bakiye, ekstre, mal kabul dökümü, ödeme.
//
// ledgerController ham cari defterdir (her iki taraf, her tip, kayıt odaklı).
// Bu dosya GÖREV odaklıdır: "bugün kime ne ödeyeceğim, kimin bakiyesi
// kapanmadı, hangi mal kabulün fiyatı girilmemiş". İkisi ayrı çünkü sorular
// ayrı; tek dosyada birleştirilseydi her fonksiyon bir scope parametresine
// dönerdi.
//
// signFor ledgerController'dan İMPORT EDİLİYOR, kopyalanmıyor — yeni bir
// hareket tipi eklendiğinde biri güncellenip diğeri unutulursa bakiye iki
// ekranda iki farklı rakam gösterir.

import { prisma } from '../utils/prismaClient.js'
import { audit, auditCreate, auditDelete } from '../utils/audit.js'
import { startOfLocalDay, endOfLocalDay, clampClientTime, toPriceDate } from '../utils/date.js'
import { parsePagination, paginated } from '../utils/pagination.js'
import { round2 } from '../utils/money.js'
import { signFor, PAYMENT_METHODS } from './ledgerController.js'
import { purchasePriceOf } from '../utils/purchasePrices.js'
import { trackingRange, clampToTracking, purchaseTrackingStart } from '../utils/purchaseTracking.js'
import { getPurchasePriceMap } from './purchasePriceController.js'

const PRODUCER_TYPES = ['PRODUCER_DEBT', 'PRODUCER_PAYMENT', 'PRODUCER_ADJUSTMENT']

// Fiyat kaynağı → ekranda görünecek etiket. Tek yerde çünkü hem döküm hem
// panel aynı dili konuşmalı: kullanıcı "Özel fiyat" rozetini iki ekranda
// farklı görürse hangisinin doğru olduğunu sorar.
export function priceSourceLabel(source, premiumPct) {
  if (source === 'PRODUCER_SPECIAL') return 'Özel fiyat'
  if (source === 'PRODUCER_PREMIUM') {
    const p = Number(premiumPct ?? 0)
    return `${p >= 0 ? '+' : '−'}%${Math.abs(p)} ${p >= 0 ? 'prim' : 'iskonto'}`
  }
  if (source === 'GENERAL') return 'Genel'
  return 'Fiyatsız'
}

// ————————————————————————— Bakiye listesi —————————————————————————

// Üretici bakiyeleri + panel metrikleri.
//
// SAYFALANMIYOR — bilinçli: üretici sayısı yüzlerle sınırlı ve mevcut
// producerBalances de tümünü dönüyor. Tam liste gelince toplu ödeme seçimi
// sayfalar arasında tutarlı kalıyor, sıralama anında çalışıyor ve export
// fetchAllPages'e ihtiyaç duymuyor.
//
// KRİTİK AYRIM: balance KÜMÜLATİFTİR (tarih filtresinden bağımsız), intakeTotal
// ve paidTotal ise DÖNEMSELDİR. Bakiye de filtrelenseydi muhasebeci "bu ay
// 5.000 borç, 5.000 ödendi → bakiye 0" sanır ve geçmiş devir gizlenirdi.
export async function balances(req, res, next) {
  try {
    const { regionId, dateFrom, dateTo, onlyDebt, includeInactive, q } = req.query

    const periodWhere = {}
    if (dateFrom || dateTo) {
      periodWhere.occurredAt = {}
      if (dateFrom) periodWhere.occurredAt.gte = startOfLocalDay(dateFrom)
      if (dateTo) periodWhere.occurredAt.lte = endOfLocalDay(dateTo)
    }

    const producerWhere = {}
    if (regionId) producerWhere.regionId = Number(regionId)
    // Pasif üretici varsayılan olarak gizli AMA bakiyesi varsa yine gösteriliyor
    // (aşağıda). Borçlu bir üreticiyi listeden düşürmek para kaybettirir.
    if (q) producerWhere.name = { contains: String(q), mode: 'insensitive' }

    const [producers, allGroups, periodGroups, lastPayments, lastDebts, pendingCounts] = await Promise.all([
      prisma.producer.findMany({
        where: producerWhere,
        include: { region: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
      }),
      // Kümülatif bakiye — tarih filtresi YOK
      prisma.ledgerEntry.groupBy({
        by: ['producerId', 'type'],
        where: { producerId: { not: null } },
        _sum: { amount: true },
      }),
      // Dönemsel toplamlar
      prisma.ledgerEntry.groupBy({
        by: ['producerId', 'type'],
        where: { producerId: { not: null }, ...periodWhere },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.ledgerEntry.groupBy({
        by: ['producerId'],
        where: { type: 'PRODUCER_PAYMENT' },
        _max: { occurredAt: true },
      }),
      prisma.ledgerEntry.groupBy({
        by: ['producerId'],
        where: { type: 'PRODUCER_DEBT' },
        _max: { occurredAt: true },
      }),
      // Fiyatı girilmediği için borcu yazılamamış mal kabul sayısı — üreticinin
      // bakiyesi bu kadar EKSİK demek, panelde uyarı olarak gösteriliyor.
      //
      // trackingRange: alış takibi başlamadan ÖNCEKİ kayıtlar sayılmaz. Onların
      // fiyatı hiç olmadı ve olmayacak (bilinçli karar); uyarıya karışsalar
      // panel açılır açılmaz yüzlerce eski kayıt kırmızı yanardı.
      prisma.entry.groupBy({
        by: ['producerId'],
        where: { producerId: { not: null }, purchasePricePerKg: null, ...trackingRange() },
        _count: { _all: true },
      }),
    ])

    const cum = new Map()
    const autoManual = new Map()
    for (const g of allGroups) {
      const cur = cum.get(g.producerId) ?? 0
      cum.set(g.producerId, cur + signFor(g.type) * (g._sum.amount ?? 0))
    }
    const period = new Map()
    for (const g of periodGroups) {
      const cur = period.get(g.producerId) ?? { debt: 0, paid: 0, adjust: 0, count: 0 }
      const v = g._sum.amount ?? 0
      if (g.type === 'PRODUCER_DEBT') cur.debt += v
      else if (g.type === 'PRODUCER_PAYMENT') cur.paid += v
      else cur.adjust += v
      cur.count += g._count?._all ?? 0
      period.set(g.producerId, cur)
    }
    const lastPay = new Map(lastPayments.map((g) => [g.producerId, g._max.occurredAt]))
    const lastDebt = new Map(lastDebts.map((g) => [g.producerId, g._max.occurredAt]))
    const pending = new Map(pendingCounts.map((g) => [g.producerId, g._count._all]))

    let rows = producers.map((p) => {
      const per = period.get(p.id) ?? { debt: 0, paid: 0, adjust: 0, count: 0 }
      return {
        id: p.id,
        name: p.name,
        active: p.active,
        regionId: p.regionId,
        regionName: p.region?.name ?? null,
        allRegions: p.allRegions,
        pricePremiumPct: p.pricePremiumPct,
        balance: round2(cum.get(p.id) ?? 0),   // KÜMÜLATİF
        intakeTotal: round2(per.debt),          // dönemsel
        paidTotal: round2(per.paid),            // dönemsel
        adjustTotal: round2(per.adjust),
        movementCount: per.count,
        lastPaymentAt: lastPay.get(p.id) ?? null,
        lastDebtAt: lastDebt.get(p.id) ?? null,
        pendingEntryCount: pending.get(p.id) ?? 0,
      }
    })

    // Pasif üretici gizlenir AMA bakiyesi varsa gösterilir — borçlu birini
    // listeden düşürmek para kaybettirir, ekran "Pasif" rozetiyle işaretler.
    if (includeInactive !== '1' && includeInactive !== 'true') {
      rows = rows.filter((r) => r.active || r.balance !== 0)
    }
    if (onlyDebt === '1' || onlyDebt === 'true') rows = rows.filter((r) => r.balance > 0)

    audit(req, { action: 'READ', resource: 'producer', recordCount: rows.length })
    res.json(rows)
  } catch (err) { next(err) }
}

// Panel özeti — üst karttaki 5 rakam.
export async function summary(req, res, next) {
  try {
    const { dateFrom, dateTo } = req.query
    const periodWhere = { producerId: { not: null } }
    if (dateFrom || dateTo) {
      periodWhere.occurredAt = {}
      if (dateFrom) periodWhere.occurredAt.gte = startOfLocalDay(dateFrom)
      if (dateTo) periodWhere.occurredAt.lte = endOfLocalDay(dateTo)
    }

    const [allGroups, periodGroups, unpricedCount, unpricedProducts] = await Promise.all([
      prisma.ledgerEntry.groupBy({
        by: ['producerId', 'type'],
        where: { producerId: { not: null } },
        _sum: { amount: true },
      }),
      prisma.ledgerEntry.groupBy({ by: ['type'], where: periodWhere, _sum: { amount: true } }),
      // Alış takibi başlangıcından İTİBAREN (bkz. utils/purchaseTracking.js)
      prisma.entry.count({ where: { producerId: { not: null }, purchasePricePerKg: null, ...trackingRange() } }),
      prisma.entry.groupBy({
        by: ['productId'],
        where: { producerId: { not: null }, purchasePricePerKg: null, ...trackingRange() },
      }),
    ])

    const cum = new Map()
    for (const g of allGroups) {
      cum.set(g.producerId, (cum.get(g.producerId) ?? 0) + signFor(g.type) * (g._sum.amount ?? 0))
    }
    let totalDebt = 0, withBalance = 0, advance = 0
    for (const v of cum.values()) {
      if (v > 0) { totalDebt += v; withBalance++ }
      else if (v < 0) advance += v   // ters bakiye: fazla ödeme / avans
    }
    const per = Object.fromEntries(periodGroups.map((g) => [g.type, g._sum.amount ?? 0]))

    res.json({
      period: { dateFrom: dateFrom ?? null, dateTo: dateTo ?? null },
      // KÜMÜLATİF — tarih filtresinden etkilenmez
      totalOutstanding: round2(totalDebt),
      producersWithBalance: withBalance,
      totalAdvance: round2(Math.abs(advance)),
      // DÖNEMSEL
      periodIntake: round2(per.PRODUCER_DEBT ?? 0),
      periodPaid: round2(per.PRODUCER_PAYMENT ?? 0),
      // Uyarı: bu kadar mal kabulün alış fiyatı yok, borcu YAZILMADI →
      // yukarıdaki toplam borç o kadar EKSİK.
      unpricedEntryCount: unpricedCount,
      unpricedProductCount: unpricedProducts.length,
    })
  } catch (err) { next(err) }
}

// ————————————————————————— Hesap ekstresi —————————————————————————

// Yürüyen bakiyeli ekstre.
//
// runningBalance BACKEND'de hesaplanıyor: liste sayfalı, frontend 2. sayfada
// önceki sayfaların toplamını bilemez. openingBalance dönem başı devri verir —
// onsuz ekstre "bu ay ne oldu"yu gösterir ama "ne kadar borçluyuz"u göstermez.
export async function statement(req, res, next) {
  try {
    const producerId = Number(req.params.id)
    const producer = await prisma.producer.findUnique({
      where: { id: producerId },
      include: { region: { select: { id: true, name: true } } },
    })
    if (!producer) return res.status(404).json({ error: 'Üretici bulunamadı' })

    const { dateFrom, dateTo } = req.query
    const where = { producerId, type: { in: PRODUCER_TYPES } }
    if (dateFrom || dateTo) {
      where.occurredAt = {}
      if (dateFrom) where.occurredAt.gte = startOfLocalDay(dateFrom)
      if (dateTo) where.occurredAt.lte = endOfLocalDay(dateTo)
    }

    const pg = parsePagination(req)
    const [openingGroups, rows, total] = await Promise.all([
      // Dönem başı devri: dateFrom'dan ÖNCEKİ her şeyin toplamı
      dateFrom
        ? prisma.ledgerEntry.groupBy({
          by: ['type'],
          where: { producerId, occurredAt: { lt: startOfLocalDay(dateFrom) } },
          _sum: { amount: true },
        })
        : Promise.resolve([]),
      prisma.ledgerEntry.findMany({
        where,
        // Ekstre ESKİDEN YENİYE: yürüyen bakiye ancak bu sırayla anlamlı.
        // Diğer listelerin tersine sıralı olması bilinçli farktır.
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        skip: pg.skip,
        take: pg.limit,
        include: { entry: { select: { id: true, productId: true, product: { select: { name: true } } } } },
      }),
      prisma.ledgerEntry.count({ where }),
    ])

    let opening = 0
    for (const g of openingGroups) opening += signFor(g.type) * (g._sum.amount ?? 0)

    // Sayfa 2'nin ilk satırı, sayfa 1'in son bakiyesinden devam etmeli:
    // önceki sayfaların toplamını ayrıca hesapla.
    let running = opening
    if (pg.skip > 0) {
      const before = await prisma.ledgerEntry.findMany({
        where, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take: pg.skip,
        select: { type: true, amount: true },
      })
      for (const b of before) running += signFor(b.type) * b.amount
    }

    const data = rows.map((r) => {
      running = round2(running + signFor(r.type) * r.amount)
      return {
        id: r.id,
        type: r.type,
        amount: r.amount,
        // Yön: borç artırıyor mu azaltıyor mu — ekran "Borç/Alacak" kolonlarını
        // buna göre dolduruyor, kendi başına signFor bilmesine gerek kalmıyor.
        direction: signFor(r.type),
        occurredAt: r.occurredAt,
        note: r.note,
        createdBy: r.createdBy,
        paymentMethod: r.paymentMethod,
        entryId: r.entryId,
        productName: r.entry?.product?.name ?? null,
        // Otomatik kayıt mı — ekran silme butonunu buna göre gizler
        automatic: r.entryId != null,
        runningBalance: running,
      }
    })

    audit(req, { action: 'READ', resource: 'ledger', recordCount: data.length })
    res.json({
      producer: {
        id: producer.id, name: producer.name, active: producer.active,
        regionName: producer.region?.name ?? null, pricePremiumPct: producer.pricePremiumPct,
      },
      openingBalance: round2(opening),
      ...paginated(data, total, pg),
    })
  } catch (err) { next(err) }
}

// ————————————————————————— Mal kabul dökümü —————————————————————————

// "Ne aldık, kaça aldık, neden o fiyat" — panelin kalbi.
//
// amount LEDGER'DAN okunuyor, purchaseQty × purchasePricePerKg ile YENİDEN
// HESAPLANMIYOR: yuvarlama farkı üretir ve updateEntry senkronunu atlar.
// Ledger kaydı otoritedir; çarpım yalnız gösterim içindir.
export async function intakes(req, res, next) {
  try {
    const producerId = Number(req.params.id)
    const { dateFrom, dateTo } = req.query
    const where = { producerId }
    if (dateFrom || dateTo) {
      where.createdAt = {}
      if (dateFrom) where.createdAt.gte = startOfLocalDay(dateFrom)
      if (dateTo) where.createdAt.lte = endOfLocalDay(dateTo)
    }

    const pg = parsePagination(req)
    const [rows, total] = await Promise.all([
      prisma.entry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pg.skip,
        take: pg.limit,
        include: {
          product: { select: { id: true, name: true, icon: true } },
          market: { select: { id: true, no: true, name: true } },
          ledgerEntry: { select: { id: true, amount: true } },
          regionSession: { select: { region: { select: { name: true } } } },
        },
      }),
      prisma.entry.count({ where }),
    ])

    // Prim yüzdesi kayıtta durmuyor (sadece kaynağı duruyor) — rozetin
    // "+%5 prim" yazabilmesi için üreticinin GÜNCEL primi kullanılıyor.
    // Prim sonradan değişmişse etiket bugünkü değeri gösterir ama TUTAR
    // snapshot'tan gelir, yani para hep doğru; etiket bilgilendirmedir.
    const producer = await prisma.producer.findUnique({
      where: { id: producerId }, select: { pricePremiumPct: true },
    })
    const pct = producer?.pricePremiumPct ?? 0

    const data = rows.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      product: e.product,
      market: e.market,
      regionName: e.regionSession?.region?.name ?? null,
      unit: e.unit,
      source: e.source,
      weak: e.weak,
      bQuality: e.bQuality,
      disposableCase: e.disposableCase,
      caseCount: e.caseCount,
      // Mal kabul anındaki miktar (borcun dayanağı)
      purchaseQty: e.purchaseQty,
      // Güncel stok miktarı — transferde yeniden tartılmış olabilir
      weight: e.weight,
      // Fark = fire / bölünme. Ekran "3 kg fire" diye gösterir; borç değişmez
      // çünkü fire de ödeniyor.
      qtyDrift: e.purchaseQty != null ? round2(e.weight - e.purchaseQty) : null,
      purchasePricePerKg: e.purchasePricePerKg,
      purchasePriceSource: e.purchasePriceSource,
      priceSourceLabel: priceSourceLabel(e.purchasePriceSource, pct),
      markupPct: e.purchasePriceSource === 'PRODUCER_PREMIUM' ? pct : null,
      // OTORİTE: borç tutarı ledger'dan
      amount: e.ledgerEntry?.amount ?? null,
      ledgerEntryId: e.ledgerEntry?.id ?? null,
    }))

    audit(req, { action: 'READ', resource: 'entry', recordCount: data.length })
    res.json(paginated(data, total, pg))
  } catch (err) { next(err) }
}

// ————————————————————————— Ödeme —————————————————————————

function validatePaymentRow({ amount, paymentMethod }) {
  const a = Number(amount)
  if (!Number.isFinite(a)) return 'Tutar geçersiz'
  // Negatif ödeme bakiyeyi ARTIRIR (signFor -1 ile çarpıyor) — yani "ödeme"
  // girerken borç yazılır. ledgerController'da aynı tuzak bir kez yaşandı.
  if (a <= 0) return 'Ödeme tutarı sıfırdan büyük olmalı'
  if (paymentMethod && !PAYMENT_METHODS.includes(paymentMethod)) {
    return 'Ödeme yöntemi nakit, havale veya çek olmalı'
  }
  return null
}

// Üreticiye ödeme. Fazla ödeme ENGELLENMEZ — avans gerçek bir senaryo;
// bakiye eksiye düşer ve panelde "avans" olarak görünür.
//
// balanceBefore/After yanıtta dönüyor: makbuz bunları frontend'de
// HESAPLAMAMALI. Modal açıldığı andaki bakiye, kayıt anındakinden farklı
// olabilir (başka kullanıcı aynı anda ödeme girmiş olabilir).
export async function createPayment(req, res, next) {
  try {
    const producerId = Number(req.params.id)
    const { amount, paymentMethod, note, occurredAt, reference } = req.body
    const invalid = validatePaymentRow({ amount, paymentMethod })
    if (invalid) return res.status(400).json({ error: invalid })

    const producer = await prisma.producer.findUnique({
      where: { id: producerId },
      include: { region: { select: { name: true } } },
    })
    if (!producer) return res.status(404).json({ error: 'Üretici bulunamadı' })

    const createdBy = req.user?.name || req.user?.username || 'Admin'
    const at = clampClientTime(occurredAt, { maxPastMs: 90 * 24 * 60 * 60 * 1000 })
    const a = round2(amount)

    const before = await producerBalance(producerId)
    const entry = await prisma.ledgerEntry.create({
      data: {
        type: 'PRODUCER_PAYMENT',
        amount: a,
        producerId,
        paymentMethod: paymentMethod || null,
        occurredAt: at,
        createdBy,
        note: [note?.trim(), reference?.trim() ? `Ref: ${reference.trim()}` : null]
          .filter(Boolean).join(' · ') || null,
      },
    })

    auditCreate(req, 'ledger', entry.id, `Üreticiye ödeme · ${producer.name} · ${a} TL${paymentMethod ? ` (${paymentMethod})` : ''}`)
    res.status(201).json({
      ...entry,
      producer: { id: producer.id, name: producer.name, regionName: producer.region?.name ?? null },
      balanceBefore: before,
      balanceAfter: round2(before - a),
    })
  } catch (err) { next(err) }
}

// Toplu ödeme — TEK TRANSACTION.
//
// Frontend'de N ayrı POST atmak KABUL EDİLEMEZ: 12 ödemenin 7'si yazılıp 5'i
// patlarsa muhasebede telafisi olmayan yarım kayıt kalır ve hangisinin
// yazıldığı ancak elle ayıklanır.
//
// clientId ile idempotent: çift tıklama ya da retry ikinci kez para yazamaz
// (createEntryBatch / createReturnBatch ile aynı desen).
export async function createPaymentBatch(req, res, next) {
  const { clientId } = req.body
  try {
    const { rows, paymentMethod, occurredAt, note } = req.body
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ error: 'En az bir ödeme satırı gerekli' })
    }
    if (rows.length > 200) {
      return res.status(400).json({ error: 'Tek seferde en fazla 200 ödeme girilebilir' })
    }

    if (clientId) {
      const seen = await prisma.syncedBatch.findUnique({ where: { clientId } })
      if (seen) return res.json({ alreadySynced: true, recordIds: seen.recordIds, count: seen.recordIds.length })
    }

    // Doğrulama transaction DIŞINDA: hata varsa hiç transaction açılmasın ve
    // kullanıcı HANGİ satırın hatalı olduğunu görsün.
    const ids = [...new Set(rows.map((r) => Number(r.producerId)))]
    const producers = await prisma.producer.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    })
    if (producers.length !== ids.length) {
      return res.status(404).json({ error: 'Seçilen üreticilerden biri bulunamadı' })
    }
    const nameOf = new Map(producers.map((p) => [p.id, p.name]))
    for (let i = 0; i < rows.length; i++) {
      const invalid = validatePaymentRow({ amount: rows[i].amount, paymentMethod: rows[i].paymentMethod ?? paymentMethod })
      if (invalid) return res.status(400).json({ error: `${i + 1}. satır (${nameOf.get(Number(rows[i].producerId)) ?? '?'}): ${invalid}` })
    }

    const createdBy = req.user?.name || req.user?.username || 'Admin'
    const at = clampClientTime(occurredAt, { maxPastMs: 90 * 24 * 60 * 60 * 1000 })

    // Ödeme ÖNCESİ bakiyeler — makbuzlar için, transaction dışında tek sorgu
    const beforeMap = await producerBalanceMap(ids)

    const created = await prisma.$transaction(async (tx) => {
      // İLK ADIM idempotency kaydı: PK ihlali burada patlarsa hiçbir ödeme
      // yazılmaz (createEntryBatch ile aynı gerekçe).
      if (clientId) {
        await tx.syncedBatch.create({ data: { clientId, kind: 'PRODUCER_PAYMENT_BATCH', recordIds: [], createdBy } })
      }
      const out = []
      for (const r of rows) {
        const pid = Number(r.producerId)
        const a = round2(r.amount)
        const led = await tx.ledgerEntry.create({
          data: {
            type: 'PRODUCER_PAYMENT',
            amount: a,
            producerId: pid,
            paymentMethod: r.paymentMethod ?? paymentMethod ?? null,
            occurredAt: at,
            createdBy,
            note: (r.note ?? note)?.trim() || null,
          },
        })
        const before = beforeMap.get(pid) ?? 0
        out.push({
          ...led,
          producer: { id: pid, name: nameOf.get(pid) },
          balanceBefore: before,
          balanceAfter: round2(before - a),
        })
      }
      if (clientId) {
        await tx.syncedBatch.update({ where: { clientId }, data: { recordIds: out.map((o) => o.id) } })
      }
      return out
    })

    const totalAmount = round2(created.reduce((s, c) => s + c.amount, 0))
    // Parti tek satır olarak loglanıyor — 40 ödeme 40 log üretirse denetim
    // ekranı okunmaz olur (createEntryBatch ile aynı gerekçe).
    auditCreate(req, 'ledger', created[0]?.id ?? null,
      `Toplu üretici ödemesi · ${created.length} üretici · ${totalAmount} TL`, created.length)
    res.status(201).json({ count: created.length, totalAmount, receipts: created })
  } catch (err) {
    if (clientId && err?.code === 'P2002') {
      const seen = await prisma.syncedBatch.findUnique({ where: { clientId } })
      return res.json({ alreadySynced: true, recordIds: seen?.recordIds ?? [] })
    }
    next(err)
  }
}

// Ödeme listesi (Ödeme Geçmişi sekmesi)
export async function listPayments(req, res, next) {
  try {
    const { producerId, dateFrom, dateTo, paymentMethod } = req.query
    const where = { type: 'PRODUCER_PAYMENT' }
    if (producerId) where.producerId = Number(producerId)
    if (paymentMethod) where.paymentMethod = paymentMethod
    if (dateFrom || dateTo) {
      where.occurredAt = {}
      if (dateFrom) where.occurredAt.gte = startOfLocalDay(dateFrom)
      if (dateTo) where.occurredAt.lte = endOfLocalDay(dateTo)
    }
    const pg = parsePagination(req)
    const [data, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where, orderBy: { occurredAt: 'desc' }, skip: pg.skip, take: pg.limit,
        include: { producer: { select: { id: true, name: true, region: { select: { name: true } } } } },
      }),
      prisma.ledgerEntry.count({ where }),
    ])
    audit(req, { action: 'READ', resource: 'ledger', recordCount: data.length })
    res.json(paginated(data, total, pg))
  } catch (err) { next(err) }
}

// ————————————————————————— Fiyatsız mal kabul —————————————————————————

// Borcu yazılamamış mal kabuller. İKİ KOVA çünkü iki farklı düzeltme gerekiyor:
//   noPrice    → alış fiyatı girilmemiş  → fiyat gir + yeniden hesapla
//   noProducer → üretici seçilmemiş      → üretici ata
//
// Bu liste OLMADAN toplam borç sessizce eksik kalır ve kimse fark etmez —
// createExit'in missingPrices'ı ile aynı disiplin.
export async function unpriced(req, res, next) {
  try {
    const { dateFrom, dateTo } = req.query
    let range = {}
    if (dateFrom || dateTo) {
      range.createdAt = {}
      if (dateFrom) range.createdAt.gte = startOfLocalDay(dateFrom)
      if (dateTo) range.createdAt.lte = endOfLocalDay(dateTo)
    }
    // Kullanıcı dateFrom'u geriye çekse bile alış takibi başlangıcının
    // GERİSİNE inilmez — o dönemin fiyatı hiç olmadı, uyarı listesi tarihsel
    // bir gerçeği değil gerçek bir eksikliği göstermeli.
    range = clampToTracking(range)

    const [noPriceRows, noProducerRows] = await Promise.all([
      prisma.entry.findMany({
        where: { producerId: { not: null }, purchasePricePerKg: null, ...range },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        include: {
          product: { select: { id: true, name: true, icon: true, unit: true } },
          producer: { select: { id: true, name: true } },
        },
      }),
      prisma.entry.findMany({
        // source HARVEST filtresi: iade/imha entry'lerinin üreticisi BİLEREK
        // null (çift borç koruması, bkz. transferController.writeReturnRow).
        // Onları "üretici atanmalı" listesine koymak yanlış yönlendirir.
        where: { producerId: null, source: 'HARVEST', ...range },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        include: { product: { select: { id: true, name: true, icon: true, unit: true } } },
      }),
    ])

    // Ürün bazında gruplu: tek fiyat girişi N kaydı birden çözer, ekran
    // kullanıcıyı 200 satır yerine 6 ürüne yönlendirir.
    const groups = new Map()
    for (const e of noPriceRows) {
      const g = groups.get(e.productId) ?? {
        productId: e.productId, productName: e.product.name, icon: e.product.icon,
        unit: e.product.unit, entryCount: 0, producerIds: new Set(),
        totalQuantity: 0, firstDate: e.createdAt, lastDate: e.createdAt, entries: [],
      }
      g.entryCount++
      g.producerIds.add(e.producerId)
      g.totalQuantity += e.weight
      if (e.createdAt < g.firstDate) g.firstDate = e.createdAt
      if (e.createdAt > g.lastDate) g.lastDate = e.createdAt
      if (g.entries.length < 50) {
        g.entries.push({
          id: e.id, createdAt: e.createdAt, producerId: e.producerId,
          producerName: e.producer?.name ?? null, quantity: e.weight, unit: e.unit,
        })
      }
      groups.set(e.productId, g)
    }

    // Ürünün HİÇ alış fiyatı yok mu, yoksa o tarihte mi yoktu — iki durum
    // farklı düzeltme gerektirir, ekran ayrı mesaj basar.
    const productIds = [...groups.keys()]
    const havingAny = productIds.length
      ? await prisma.purchasePrice.groupBy({ by: ['productId'], where: { productId: { in: productIds } } })
      : []
    const hasPrice = new Set(havingAny.map((h) => h.productId))

    res.json({
      noPrice: {
        count: noPriceRows.length,
        productCount: groups.size,
        groups: [...groups.values()].map((g) => ({
          ...g,
          producerCount: g.producerIds.size,
          producerIds: undefined,
          totalQuantity: round2(g.totalQuantity),
          reason: hasPrice.has(g.productId) ? 'NO_PRICE_ON_DATE' : 'NO_GENERAL_PRICE',
        })),
      },
      noProducer: {
        count: noProducerRows.length,
        data: noProducerRows.slice(0, 200).map((e) => ({
          id: e.id, createdAt: e.createdAt, product: e.product,
          quantity: e.weight, unit: e.unit, caseCount: e.caseCount,
        })),
      },
    })
  } catch (err) { next(err) }
}

// Fiyat sonradan girildi → bekleyen kayıtlara borç üret.
//
// İDEMPOTENT: yalnız purchasePricePerKg NULL ve ledgerEntry YOK olan satırlara
// dokunur. İki kez çalıştırılırsa ikinci turda 0 satır bulur — çift borç
// yazamaz.
//
// Fiyat KAYDIN KENDİ GÜNÜNE göre çözülür, bugüne göre değil: üç gün önceki mal
// kabul, üç gün önceki fiyattan hesaplanmalı.
export async function recalculate(req, res, next) {
  try {
    const { dateFrom, dateTo, productId, dryRun } = req.body ?? {}
    let where = { producerId: { not: null }, purchasePricePerKg: null, ledgerEntry: { is: null } }
    if (productId) where.productId = Number(productId)
    if (dateFrom || dateTo) {
      where.createdAt = {}
      if (dateFrom) where.createdAt.gte = startOfLocalDay(dateFrom)
      if (dateTo) where.createdAt.lte = endOfLocalDay(dateTo)
    }
    // GÜVENLİK KAPISI: bu uç geçmişe borç YAZMAMALI. Alış takibi başlamadan
    // önceki kayıtlar bilinçli olarak borçsuz bırakıldı (o dönem elle kapatıldı);
    // buradan yazılırsa üreticiye ikinci kez ödeme çıkar. Geriye dönük borç
    // gerekiyorsa ayrı, opt-in ve elle çalıştırılan script var:
    // scripts/backfill-producer-debt.js
    where = clampToTracking(where)

    const candidates = await prisma.entry.findMany({
      where,
      include: { product: { select: { name: true, unit: true } }, producer: { select: { pricePremiumPct: true } } },
      orderBy: { createdAt: 'asc' },
      take: 5000,
    })
    if (!candidates.length) return res.json({ scanned: 0, written: 0, stillUnpriced: 0, rows: [] })

    // Fiyat map'i GÜN BAZINDA cache'leniyor: 500 kayıt aynı güne aitse tek
    // sorgu yeter. Üretici id'leri de güne göre toplanıyor.
    const byDay = new Map()
    for (const e of candidates) {
      const key = toPriceDate(e.createdAt).toISOString().slice(0, 10)
      const g = byDay.get(key) ?? { day: e.createdAt, producerIds: new Set(), rows: [] }
      g.producerIds.add(e.producerId)
      g.rows.push(e)
      byDay.set(key, g)
    }
    const maps = new Map()
    for (const [key, g] of byDay) {
      maps.set(key, await getPurchasePriceMap(toPriceDate(g.day), [...g.producerIds]))
    }

    const plan = []
    for (const e of candidates) {
      const key = toPriceDate(e.createdAt).toISOString().slice(0, 10)
      const p = purchasePriceOf(maps.get(key), {
        productId: e.productId,
        producerId: e.producerId,
        premiumPct: e.producer?.pricePremiumPct ?? 0,
      })
      if (p.pricePerKg == null) continue
      const amount = round2(p.pricePerKg * e.weight)
      if (amount <= 0) continue
      plan.push({ entry: e, price: p, amount })
    }

    if (dryRun) {
      return res.json({
        dryRun: true,
        scanned: candidates.length,
        wouldWrite: plan.length,
        stillUnpriced: candidates.length - plan.length,
        totalAmount: round2(plan.reduce((s, p) => s + p.amount, 0)),
        rows: plan.slice(0, 100).map((p) => ({
          entryId: p.entry.id, productName: p.entry.product.name, producerId: p.entry.producerId,
          quantity: p.entry.weight, pricePerKg: p.price.pricePerKg, source: p.price.source, amount: p.amount,
        })),
      })
    }

    const createdBy = req.user?.name || req.user?.username || 'Admin'
    let written = 0
    // Tek transaction: yarım kalırsa hangi kaydın borcu yazıldı belirsiz olur.
    await prisma.$transaction(async (tx) => {
      for (const { entry: e, price: p, amount } of plan) {
        await tx.entry.update({
          where: { id: e.id },
          data: {
            purchasePricePerKg: p.pricePerKg,
            purchasePriceSource: p.source,
            // Geçmiş kayıtta purchaseQty yok; bugünkü weight yazılıyor.
            // DİKKAT: kayıt transfer görmüşse bu, mal kabul anındaki miktardan
            // farklı olabilir. Sonradan girilen fiyat için kaçınılmaz kabul —
            // alternatifi hiç borç yazmamak.
            purchaseQty: e.purchaseQty ?? e.weight,
          },
        })
        await tx.ledgerEntry.create({
          data: {
            type: 'PRODUCER_DEBT', amount, producerId: e.producerId, entryId: e.id,
            occurredAt: e.createdAt, createdBy,
            note: `Mal kabul #${e.id} · ${e.product.name} · fiyat sonradan girildi`,
          },
        })
        written++
      }
    }, { timeout: 60_000 })

    audit(req, {
      action: 'UPDATE', resource: 'ledger', recordCount: written,
      detail: `Fiyatı sonradan girilen ${written} mal kabul için üretici borcu oluşturuldu`,
    })
    res.json({
      scanned: candidates.length, written,
      stillUnpriced: candidates.length - written,
      totalAmount: round2(plan.reduce((s, p) => s + p.amount, 0)),
    })
  } catch (err) { next(err) }
}

// Üreticisiz mal kabule üretici ata → borcu doğur.
export async function assignProducer(req, res, next) {
  try {
    const id = Number(req.params.id)
    const producerId = Number(req.body?.producerId)
    if (!Number.isInteger(producerId)) return res.status(400).json({ error: 'Üretici seçilmeli' })

    const entry = await prisma.entry.findUnique({
      where: { id },
      include: { product: { select: { name: true, unit: true } }, ledgerEntry: true },
    })
    if (!entry) return res.status(404).json({ error: 'Mal kabul bulunamadı' })
    if (entry.producerId) return res.status(400).json({ error: 'Bu kaydın üreticisi zaten atanmış' })
    // İade/imha entry'sinin üreticisi BİLEREK boş (çift borç koruması) —
    // buraya üretici atamak aynı mala ikinci kez ödeme yazar.
    if (entry.source !== 'HARVEST') {
      return res.status(400).json({ error: 'İade/imha kaydına üretici atanamaz — mal zaten bir kez satın alındı' })
    }

    const producer = await prisma.producer.findUnique({
      where: { id: producerId }, select: { id: true, name: true, active: true, pricePremiumPct: true },
    })
    if (!producer) return res.status(404).json({ error: 'Üretici bulunamadı' })

    // Fiyat KAYDIN KENDİ GÜNÜNE göre — bugüne göre değil.
    const map = await getPurchasePriceMap(toPriceDate(entry.createdAt), [producerId])
    const p = purchasePriceOf(map, {
      productId: entry.productId, producerId, premiumPct: producer.pricePremiumPct ?? 0,
    })

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.entry.update({
        where: { id },
        data: {
          producerId,
          purchasePricePerKg: p.pricePerKg,
          purchasePriceSource: p.source,
          purchaseQty: entry.purchaseQty ?? entry.weight,
        },
        include: { product: true, producer: true, market: true },
      })
      if (p.pricePerKg != null) {
        const amount = round2(p.pricePerKg * entry.weight)
        if (amount > 0) {
          await tx.ledgerEntry.create({
            data: {
              type: 'PRODUCER_DEBT', amount, producerId, entryId: id,
              occurredAt: entry.createdAt,
              createdBy: req.user?.name || req.user?.username || 'Admin',
              note: `Mal kabul #${id} · ${entry.product.name} · üretici sonradan atandı`,
            },
          })
        }
      }
      return row
    })

    audit(req, {
      action: 'UPDATE', resource: 'entry', recordId: id,
      detail: `Üretici atandı: ${producer.name}`
        + (p.pricePerKg != null ? ` · borç ${round2(p.pricePerKg * entry.weight)} TL yazıldı` : ' · alış fiyatı yok, borç yazılmadı'),
    })
    res.json({ ...updated, debtWritten: p.pricePerKg != null })
  } catch (err) { next(err) }
}

// ————————————————————————— Yardımcılar —————————————————————————

async function producerBalance(producerId) {
  const groups = await prisma.ledgerEntry.groupBy({
    by: ['type'], where: { producerId }, _sum: { amount: true },
  })
  let bal = 0
  for (const g of groups) bal += signFor(g.type) * (g._sum.amount ?? 0)
  return round2(bal)
}

async function producerBalanceMap(ids) {
  const groups = await prisma.ledgerEntry.groupBy({
    by: ['producerId', 'type'], where: { producerId: { in: ids } }, _sum: { amount: true },
  })
  const map = new Map()
  for (const g of groups) {
    map.set(g.producerId, round2((map.get(g.producerId) ?? 0) + signFor(g.type) * (g._sum.amount ?? 0)))
  }
  return map
}
