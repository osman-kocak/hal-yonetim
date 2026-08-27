#!/usr/bin/env node
/**
 * GERİYE DÖNÜK ÜRETİCİ BORCU — opt-in, dry-run varsayılan.
 *
 * Otomatik borç 2026-08-26'da devreye girdi. Ondan önceki mal kabullerin
 * purchasePricePerKg'si NULL ve borçları yok. Bu script, muhasebeci geçmiş
 * tarihlere alış fiyatı girdikten SONRA o kayıtların borcunu üretir.
 *
 * MIGRATION BUNU YAPMAZ: migration çalıştığında PurchasePrice tablosu boştur;
 * olmayan fiyattan borç üretmek uydurmaktır.
 *
 * ÖN ŞART: geçmiş tarihli alış fiyatları girilmiş olmalı
 *   POST /api/admin/purchase-prices { productId, pricePerKg, date: "2026-08-22" }
 *
 * KULLANIM:
 *   node scripts/backfill-producer-debt.js --from 2026-08-22 --to 2026-08-25
 *   node scripts/backfill-producer-debt.js --from ... --to ... --yes
 *
 * İDEMPOTENT: yalnız (üreticisi var) + (fiyatı yok) + (borcu yok) satırlara
 * dokunur. İkinci çalıştırmada 0 kayıt bulur.
 *
 * ⚠ EN BÜYÜK TEHLİKE — ÇİFT BORÇ: muhasebeci bu dönemin borcunu ELLE girmişse
 * (entryId NULL PRODUCER_DEBT), backfill üstüne bir kez daha yazar ve üreticiye
 * İKİ KAT ödeme yapılır. Script elle girilen borçları üretici bazında raporlar
 * ve varsa --force-with-manual olmadan devam ETMEZ.
 *
 * Fiyat KAYDIN KENDİ GÜNÜNE göre çözülür — bugüne göre değil.
 */
import { prisma } from '../src/utils/prismaClient.js'
import { round2 } from '../src/utils/money.js'
import { purchasePriceOf } from '../src/utils/purchasePrices.js'
import { getPurchasePriceMap } from '../src/controllers/purchasePriceController.js'
import { startOfLocalDay, endOfLocalDay, toPriceDate } from '../src/utils/date.js'

const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null }
const apply = process.argv.includes('--yes')
const forceManual = process.argv.includes('--force-with-manual')
const from = arg('--from')
const to = arg('--to')

async function main() {
  const where = { producerId: { not: null }, purchasePricePerKg: null, ledgerEntry: { is: null } }
  if (from || to) {
    where.createdAt = {}
    if (from) where.createdAt.gte = startOfLocalDay(from)
    if (to) where.createdAt.lte = endOfLocalDay(to)
  }

  const rows = await prisma.entry.findMany({
    where,
    include: {
      product: { select: { name: true, unit: true } },
      producer: { select: { id: true, name: true, pricePremiumPct: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`GERİYE DÖNÜK ÜRETİCİ BORCU${from || to ? ` · ${from ?? '…'} → ${to ?? '…'}` : ''}`)
  console.log(apply ? 'MOD: UYGULA\n' : 'MOD: KONTROL (dry-run) — yazmak için --yes\n')
  if (!rows.length) { console.log('Borcu yazılacak kayıt yok.'); return }

  // Fiyat map'i gün bazında cache'leniyor: 500 kayıt aynı güne aitse tek sorgu.
  const byDay = new Map()
  for (const e of rows) {
    const k = toPriceDate(e.createdAt).toISOString().slice(0, 10)
    const g = byDay.get(k) ?? { day: e.createdAt, ids: new Set() }
    g.ids.add(e.producerId)
    byDay.set(k, g)
  }
  const maps = new Map()
  for (const [k, g] of byDay) maps.set(k, await getPurchasePriceMap(toPriceDate(g.day), [...g.ids]))

  const plan = []
  const fiyatsiz = []
  for (const e of rows) {
    const k = toPriceDate(e.createdAt).toISOString().slice(0, 10)
    const p = purchasePriceOf(maps.get(k), {
      productId: e.productId, producerId: e.producerId, premiumPct: e.producer?.pricePremiumPct ?? 0,
    })
    if (p.pricePerKg == null) { fiyatsiz.push(e); continue }
    const amount = round2(p.pricePerKg * e.weight)
    if (amount > 0) plan.push({ e, p, amount })
  }

  // Üretici bazında özet + ELLE GİRİLEN BORÇ karşılaştırması
  const perProducer = new Map()
  for (const { e, amount } of plan) {
    const g = perProducer.get(e.producerId) ?? { name: e.producer.name, count: 0, total: 0 }
    g.count++; g.total = round2(g.total + amount)
    perProducer.set(e.producerId, g)
  }
  const manual = await prisma.ledgerEntry.groupBy({
    by: ['producerId'],
    where: { type: 'PRODUCER_DEBT', entryId: null, producerId: { in: [...perProducer.keys()] } },
    _sum: { amount: true }, _count: { _all: true },
  })
  const manualMap = new Map(manual.map((m) => [m.producerId, { total: round2(m._sum.amount ?? 0), count: m._count._all }]))

  console.log('Üretici                          Yazılacak      Elle girilmiş borç')
  console.log('─'.repeat(72))
  for (const [id, g] of perProducer) {
    const m = manualMap.get(id)
    const uyari = m ? `  ⚠ ${m.count} kayıt · ${m.total} TL` : '  —'
    console.log(`${g.name.padEnd(32).slice(0, 32)} ${String(g.count).padStart(4)} satır ${String(g.total).padStart(10)} TL${uyari}`)
  }
  console.log('─'.repeat(72))
  console.log(`TOPLAM: ${plan.length} satır · ${round2(plan.reduce((s, p) => s + p.amount, 0))} TL`)
  if (fiyatsiz.length) {
    console.log(`\n⚠ ${fiyatsiz.length} kaydın o günkü alış fiyatı hâlâ yok — atlanacak:`)
    const grup = new Map()
    for (const e of fiyatsiz) grup.set(e.product.name, (grup.get(e.product.name) ?? 0) + 1)
    for (const [ad, n] of grup) console.log(`     ${ad}: ${n} kayıt`)
    console.log('  Önce bu ürünlere GEÇMİŞ TARİHLİ alış fiyatı girin.')
  }

  console.log('\n⚠ DİKKAT: Entry.weight mal kabul sonrası transferde yeniden tartılmış')
  console.log('  olabilir. Bu satırların purchaseQty snapshot\'ı yok, güncel weight')
  console.log('  kullanılıyor — tartı farkı varsa borç o kadar sapar.')

  if (manualMap.size && !forceManual) {
    console.log(`\n═══ DURDURULDU ═══`)
    console.log(`${manualMap.size} üreticide ELLE GİRİLMİŞ borç var. Backfill üstüne yazarsa`)
    console.log('üreticiye İKİ KAT ödeme yapılır. Önce o elle kayıtları silin veya')
    console.log('gerçekten farklı mallara ait olduklarından eminseniz --force-with-manual ekleyin.')
    process.exit(1)
  }
  if (!apply) { console.log('\n(dry-run — hiçbir şey yazılmadı. Uygulamak için --yes)'); return }

  let n = 0
  await prisma.$transaction(async (tx) => {
    for (const { e, p, amount } of plan) {
      await tx.entry.update({
        where: { id: e.id },
        data: { purchasePricePerKg: p.pricePerKg, purchasePriceSource: p.source, purchaseQty: e.purchaseQty ?? e.weight },
      })
      await tx.ledgerEntry.create({
        data: {
          type: 'PRODUCER_DEBT', amount, producerId: e.producerId, entryId: e.id,
          occurredAt: e.createdAt, createdBy: 'backfill-script',
          note: `Mal kabul #${e.id} · ${e.product.name} · geriye dönük borç`,
        },
      })
      n++
    }
  }, { timeout: 120_000 })
  console.log(`\n═══ ${n} borç yazıldı ═══`)
  console.log('Doğrulama: node scripts/check-producer-debt.js')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
