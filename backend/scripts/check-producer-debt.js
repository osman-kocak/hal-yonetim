#!/usr/bin/env node
/**
 * ÜRETİCİ BORCU MUTABAKATI — salt okunur.
 *
 * Bu sistemde otomatik test altyapısı yok ve üretici borcu para yazıyor.
 * Asıl güvenlik ağı budur: her akşam çalıştırılıp "kod ne yazdı, ne yazmalıydı"
 * bağımsız olarak karşılaştırılır. Bir sapma varsa borç sessizce yanlış demektir
 * ve kimse fark etmez — üretici parasını eksik alır ya da iki kez alır.
 *
 * KULLANIM:
 *   node scripts/check-producer-debt.js
 *   node scripts/check-producer-debt.js --from 2026-08-22 --to 2026-08-26
 *
 * HİÇBİR ŞEY YAZMAZ. Çıkış kodu: 0 temiz, 1 sapma var.
 *
 * Canlıya geçtikten sonra ilk 2 hafta her akşam çalıştırılmalı.
 */
import { prisma } from '../src/utils/prismaClient.js'
import { round2 } from '../src/utils/money.js'
import { signFor } from '../src/controllers/ledgerController.js'
import { startOfLocalDay, endOfLocalDay } from '../src/utils/date.js'
import { clampToTracking, purchaseTrackingStart } from '../src/utils/purchaseTracking.js'

const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null }
const from = arg('--from')
const to = arg('--to')

const range = {}
if (from || to) {
  range.createdAt = {}
  if (from) range.createdAt.gte = startOfLocalDay(from)
  if (to) range.createdAt.lte = endOfLocalDay(to)
}

let sorun = 0
const bolum = (t) => console.log(`\n── ${t} ──`)
const hata = (m) => { sorun++; console.log(`  ✗ ${m}`) }
const iyi = (m) => console.log(`  ✓ ${m}`)

async function main() {
  console.log('ÜRETİCİ BORCU MUTABAKATI' + (from || to ? ` · ${from ?? '…'} → ${to ?? '…'}` : ' · tüm zamanlar'))

  // 1) Fiyatı ve üreticisi belli her mal kabulün borcu var mı?
  bolum('1. EKSİK BORÇ')
  const eksik = await prisma.entry.findMany({
    where: { producerId: { not: null }, purchasePricePerKg: { not: null }, ledgerEntry: { is: null }, ...range },
    include: { product: { select: { name: true } }, producer: { select: { name: true } } },
    take: 100,
  })
  if (eksik.length) {
    hata(`${eksik.length} mal kabulün fiyatı var ama BORCU YOK:`)
    for (const e of eksik.slice(0, 10)) {
      console.log(`     #${e.id} ${e.producer?.name} · ${e.product.name} · ${e.weight} × ${e.purchasePricePerKg} TL`)
    }
  } else iyi('fiyatlı her mal kabulün borcu var')

  // 2) Borç tutarı snapshot ile tutuyor mu? (updateEntry senkron kayması)
  bolum('2. TUTAR SENKRONU')
  const bagli = await prisma.ledgerEntry.findMany({
    where: { type: 'PRODUCER_DEBT', entryId: { not: null } },
    include: { entry: { select: { id: true, purchasePricePerKg: true, purchaseQty: true, weight: true, createdAt: true } } },
  })
  const kayan = bagli.filter((l) => {
    if (!l.entry?.purchasePricePerKg) return false
    const qty = l.entry.purchaseQty ?? l.entry.weight
    return Math.abs(l.amount - round2(l.entry.purchasePricePerKg * qty)) > 0.01
  })
  if (kayan.length) {
    hata(`${kayan.length} borç tutarı snapshot ile TUTMUYOR:`)
    for (const l of kayan.slice(0, 10)) {
      const beklenen = round2(l.entry.purchasePricePerKg * (l.entry.purchaseQty ?? l.entry.weight))
      console.log(`     ledger#${l.id} entry#${l.entryId}: ${l.amount} TL yazılı, ${beklenen} TL olmalı`)
    }
  } else iyi(`${bagli.length} otomatik borcun tutarı snapshot ile birebir`)

  // 3) Borcun üreticisi mal kabulün üreticisiyle aynı mı?
  bolum('3. ÜRETİCİ TUTARLILIĞI')
  const uyusmaz = await prisma.$queryRaw`
    SELECT l.id AS ledger_id, l."entryId", l."producerId" AS ledger_producer, e."producerId" AS entry_producer
    FROM "LedgerEntry" l JOIN "Entry" e ON e.id = l."entryId"
    WHERE l."producerId" IS DISTINCT FROM e."producerId"
  `
  if (uyusmaz.length) {
    hata(`${uyusmaz.length} borcun üreticisi mal kabulün üreticisinden FARKLI:`)
    for (const u of uyusmaz.slice(0, 10)) console.log(`     ledger#${u.ledger_id}: borç ${u.ledger_producer}, giriş ${u.entry_producer}`)
  } else iyi('her borç doğru üreticiye bağlı')

  // 4) ÇİFT BORÇ ALARMI — iade/imha kaydına borç yazılmış mı?
  // transferController.writeReturnRow producerId'yi BİLEREK null bırakıyor;
  // biri doldurursa aynı mal için ikinci kez ödeme yazılır.
  bolum('4. ÇİFT BORÇ ALARMI')
  const iadeBorclu = await prisma.entry.findMany({
    where: { source: { in: ['RETURN', 'DISCARD'] }, producerId: { not: null }, ledgerEntry: { isNot: null } },
    include: { ledgerEntry: { select: { id: true, amount: true } }, producer: { select: { name: true } } },
    take: 50,
  })
  // DISCARD tek başına sorun değil: mal kabulde doğrudan 99'a giriş yapılabiliyor
  // ve "fire de ödenir" kararı gereği borç yazılır. Asıl alarm iade kaynaklı olan.
  const iadeler = iadeBorclu.filter((e) => e.source === 'RETURN')
  if (iadeler.length) {
    hata(`${iadeler.length} İADE kaydına borç yazılmış — AYNI MALA İKİNCİ ÖDEME riski:`)
    for (const e of iadeler.slice(0, 10)) console.log(`     entry#${e.id} ${e.producer?.name} · ${e.ledgerEntry.amount} TL`)
  } else iyi('hiçbir iade kaydına borç yazılmamış')
  const discardBorclu = iadeBorclu.filter((e) => e.source === 'DISCARD').length
  if (discardBorclu) console.log(`     (bilgi: ${discardBorclu} imha kaydında borç var — "fire de ödenir" kararı gereği normal)`)

  // 5) Fiyatsız girişler — hata değil, uyarı. Borç o kadar EKSİK demek.
  bolum('5. FİYATSIZ MAL KABUL')
  // Alış takibi başlangıcından itibaren. Öncesi bilinçli olarak fiyatsız —
  // uyarıya karışsa her çalışmada yüzlerce eski kayıt sayılır ve rapor
  // "hep bir sorun var" der, gerçek sorun görünmez olur.
  const izleme = clampToTracking({ ...range })
  const fiyatsiz = await prisma.entry.count({ where: { producerId: { not: null }, purchasePricePerKg: null, ...izleme } })
  const ureticisiz = await prisma.entry.count({ where: { producerId: null, source: 'HARVEST', ...izleme } })
  const baslangic = purchaseTrackingStart()
  if (baslangic) console.log(`  (alış takibi başlangıcı: ${baslangic.toLocaleString('tr-TR')})`)
  if (fiyatsiz || ureticisiz) {
    console.log(`  ⚠ ${fiyatsiz} kaydın alış fiyatı yok, ${ureticisiz} kaydın üreticisi yok → toplam borç bu kadar EKSİK`)
    console.log('     Düzeltme: fiyatı gir → POST /admin/producer-payments/recalculate')
  } else iyi('fiyatsız/üreticisiz mal kabul yok')

  // 6) Bakiye bağımsız yeniden hesap
  bolum('6. BAKİYE YENİDEN HESABI')
  const hepsi = await prisma.ledgerEntry.findMany({
    where: { producerId: { not: null } },
    select: { producerId: true, type: true, amount: true },
  })
  const elle = new Map()
  for (const l of hepsi) elle.set(l.producerId, (elle.get(l.producerId) ?? 0) + signFor(l.type) * l.amount)
  const groups = await prisma.ledgerEntry.groupBy({
    by: ['producerId', 'type'], where: { producerId: { not: null } }, _sum: { amount: true },
  })
  const agg = new Map()
  for (const g of groups) agg.set(g.producerId, (agg.get(g.producerId) ?? 0) + signFor(g.type) * (g._sum.amount ?? 0))
  const sapan = [...elle.keys()].filter((k) => Math.abs(round2(elle.get(k)) - round2(agg.get(k) ?? 0)) > 0.01)
  if (sapan.length) hata(`${sapan.length} üreticide satır toplamı ile groupBy toplamı UYUŞMUYOR`)
  else iyi(`${elle.size} üreticinin bakiyesi iki bağımsız yöntemle aynı`)

  const toplamBorc = round2([...agg.values()].filter((v) => v > 0).reduce((s, v) => s + v, 0))
  const toplamAvans = round2([...agg.values()].filter((v) => v < 0).reduce((s, v) => s + v, 0))
  console.log(`\n  Toplam ödenmemiş borç: ${toplamBorc} TL`)
  if (toplamAvans) console.log(`  Toplam avans (ters bakiye): ${Math.abs(toplamAvans)} TL`)

  console.log(sorun ? `\n═══ ${sorun} SAPMA BULUNDU — incelenmeli ═══` : '\n═══ TEMİZ ═══')
  process.exit(sorun ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
