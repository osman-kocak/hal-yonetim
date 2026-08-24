#!/usr/bin/env node
/**
 * 22.08.2026 sayımı — canlıya geçiş açılış stoğu.
 *
 * Sıfırlama devirsiz yapıldı (bkz. reset-for-production.js), ama depoda duran mal
 * ve şoförlerin üzerindeki boş kasa fiziksel gerçek: sistem sıfırdan başlarken
 * bunlar açılış kaydı olarak giriliyor.
 *
 * NEDEN SCRIPT: 29 kalem + 7 bölge elle girilecek hacimde değil; ayrıca sayım
 * tek bir andın fotoğrafı, hepsi aynı createdBy ile tek seferde yazılmalı.
 *
 * NEDEN MIGRATION DEĞİL: veri girişi, şema değişikliği değil — bir kez çalışır.
 *
 * Excel'de eksik kalıp sonradan sahadan alınan üç değer (24 Ağu):
 *  · SARMA BEYAZ 292 kg → 18 kasa (Excel'de kasa hücresi boştu)
 *  · Güzelyurt 450 kasa (Excel'de boştu) · Girne 15 kasa (Excel'de 0 yazıyordu)
 *
 * Script tekrar çalıştırılabilir: zaten yazılmış satırı atlar, yalnız eksiği yazar.
 *
 * Kullanım:  node scripts/import-sayim-20260822.js         (kuru çalışma)
 *            node scripts/import-sayim-20260822.js --yes  (yazar)
 */

import { prisma } from '../src/utils/prismaClient.js'
import { findDepoMarket } from '../src/utils/markets.js'

const CREATED_BY = 'Sayım 22.08.2026'

// Depoda sayılan mal. urun = DB'deki ürün adı (Excel'deki yazımlar eşlendi:
// GREYFUT→Greyfurt, VALENSİYA→Portakal VALENSİYA BUZLUK, SARIMSAK→Sarmısak).
// miktar birimi ürünün kendi birimi: kg · bağ · adet.
const SAYIM = [
  { urun: 'LİMON SARI', kasa: 3, miktar: 55, siyah: false, zayif: false },
  { urun: 'LİMON YEDİVEREN', kasa: 2, miktar: 19, siyah: true, zayif: false },
  { urun: 'LİMON YEDİVEREN', kasa: 6, miktar: 122, siyah: false, zayif: false },
  { urun: 'LİMON YEDİVEREN', kasa: 18, miktar: 357, siyah: false, zayif: true },
  { urun: 'ÜZÜM VERİGO', kasa: 7, miktar: 140, siyah: false, zayif: false },
  { urun: 'SARMA BEYAZ', kasa: 1, miktar: 13, siyah: false, zayif: false },
  { urun: 'KABAK', kasa: 17, miktar: 303, siyah: false, zayif: true },
  { urun: 'BİBER SARI ÇARLİ', kasa: 28, miktar: 264, siyah: false, zayif: false },
  { urun: 'BİBER YEŞİL ÇARLİ', kasa: 38, miktar: 341, siyah: false, zayif: false },
  { urun: 'PANCAR BUZLUK', kasa: 11, miktar: 245, siyah: false, zayif: false },
  { urun: 'PANCAR BUZLUK', kasa: 1, miktar: 19, siyah: true, zayif: false },
  { urun: 'SARMA MOR', kasa: 21, miktar: 360, siyah: false, zayif: false },
  { urun: 'MARUL', kasa: 13, miktar: 128, siyah: false, zayif: false },
  { urun: 'ROKKA', kasa: 12, miktar: 238, siyah: false, zayif: false },
  { urun: 'TAZE NANE', kasa: 13, miktar: 260, siyah: false, zayif: false },
  { urun: 'SEMİZ OTU', kasa: 2, miktar: 40, siyah: false, zayif: false },
  { urun: 'KEREVİZ', kasa: 1, miktar: 10, siyah: true, zayif: false },
  { urun: 'GOLYANDRO', kasa: 1, miktar: 25, siyah: false, zayif: false },
  { urun: 'MARUL KIVIRCIK', kasa: 1, miktar: 12, siyah: false, zayif: false },
  { urun: 'Sarmısak İri', kasa: 5, miktar: 250, siyah: true, zayif: false },
  { urun: 'Sarmısak Baş', kasa: 19, miktar: 950, siyah: true, zayif: false },
  { urun: 'Greyfurt Buzluk', kasa: 119, miktar: 1899, siyah: false, zayif: false },
  { urun: 'Sarmısak Kilo', kasa: 146, miktar: 728, siyah: true, zayif: false },
  { urun: 'SARMA BEYAZ', kasa: 18, miktar: 292, siyah: false, zayif: false },
  { urun: 'KABAK', kasa: 30, miktar: 543, siyah: false, zayif: false },
  { urun: 'Portakal VALENSİYA BUZLUK', kasa: 128, miktar: 1326, siyah: true, zayif: false },
  { urun: 'PATATES BUZLUK', kasa: 408, miktar: 9595, siyah: true, zayif: false },
  { urun: 'SOĞAN KIRMIZI', kasa: 115, miktar: 3004, siyah: true, zayif: false },
  { urun: 'SOĞAN MOR', kasa: 17, miktar: 440, siyah: true, zayif: false },
]

// Şoförlerin üzerindeki boş kasa → REGION_OUT (bölgeye verilmiş kasa).
const SOFOR_KASA = [
  { bolge: 'Maraş', kasa: 167 },
  { bolge: 'Tatlısu', kasa: 250 },
  { bolge: 'Yeşilırmak', kasa: 585 },
  { bolge: 'Tepebaşı', kasa: 268 },
  { bolge: 'Mesarya', kasa: 350 },
  { bolge: 'Güzelyurt', kasa: 450 },
  { bolge: 'Girne', kasa: 15 },
]

// Türkçe İ/ı yüzünden düz toUpperCase() eşleşmeyi kaçırıyor (SARIMSAK/Sarmısak
// vakası); locale'li karşılaştırma şart.
const norm = (s) => String(s).trim().toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ')

const isCountable = (unit) => unit === 'BUNCH' || unit === 'PIECE'

async function main() {
  const apply = process.argv.includes('--yes')

  const depo = await findDepoMarket()
  if (!depo) throw new Error('DEPO market kaydı bulunamadı')

  const products = await prisma.product.findMany({ select: { id: true, name: true, unit: true } })
  const byName = new Map(products.map((p) => [norm(p.name), p]))

  const regions = await prisma.region.findMany({ select: { id: true, name: true } })
  const regionByName = new Map(regions.map((r) => [norm(r.name), r]))

  // Önce tüm satırları çöz — tek bir eşleşmeyen varsa hiçbir şey yazma.
  const entries = []
  const problems = []
  for (const row of SAYIM) {
    const p = byName.get(norm(row.urun))
    if (!p) { problems.push(`Ürün yok: ${row.urun}`); continue }
    const countable = isCountable(p.unit)
    if (countable && !Number.isInteger(row.miktar)) problems.push(`${p.name}: ${p.unit} miktarı tam sayı olmalı (${row.miktar})`)
    if (!countable && !(row.kasa >= 1)) problems.push(`${p.name}: kg üründe kasa adedi zorunlu`)
    entries.push({ row, p })
  }

  const movements = []
  for (const row of SOFOR_KASA) {
    const r = regionByName.get(norm(row.bolge))
    if (!r) { problems.push(`Bölge yok: ${row.bolge}`); continue }
    movements.push({ row, r })
  }

  if (problems.length) {
    console.error('\n!! Çözülemeyen satırlar:')
    problems.forEach((p) => console.error('  ·', p))
    process.exitCode = 1
    return
  }

  // Yazılmış satırları düş. Sayım parça parça tamamlandı (Excel'de eksik kalan
  // değerler sonradan sahadan geldi), o yüzden script yeniden çalıştırılabilir
  // olmalı — ama aynı kalemi ikinci kez yazmamalı.
  //
  // Eşleşme multiset: aynı ürün+kasa+miktar iki ayrı satır olarak sayılmış
  // olabilir; DB'de bulunan her kayıt yalnız bir satırı karşılar.
  const writtenEntries = await prisma.entry.findMany({
    where: { createdBy: CREATED_BY },
    select: { productId: true, caseCount: true, weight: true, weak: true, disposableCase: true },
  })
  const entryPool = new Map()
  for (const e of writtenEntries) {
    const k = `${e.productId}|${e.caseCount}|${e.weight}|${e.weak}|${e.disposableCase}`
    entryPool.set(k, (entryPool.get(k) ?? 0) + 1)
  }
  const pendingEntries = entries.filter(({ row, p }) => {
    const k = `${p.id}|${row.kasa}|${row.miktar}|${row.zayif}|${row.siyah}`
    const n = entryPool.get(k) ?? 0
    if (n > 0) { entryPool.set(k, n - 1); return false }
    return true
  })

  const writtenMoves = await prisma.caseMovement.findMany({
    where: { createdBy: CREATED_BY, type: 'REGION_OUT' },
    select: { regionId: true, qty: true },
  })
  const movePool = new Set(writtenMoves.map((m) => `${m.regionId}|${m.qty}`))
  const pendingMoves = movements.filter(({ row, r }) => !movePool.has(`${r.id}|${row.kasa}`))

  const skipped = entries.length - pendingEntries.length + (movements.length - pendingMoves.length)
  if (skipped > 0) console.log(`\n(${skipped} kalem zaten yazılmış, atlanıyor)`)
  if (!pendingEntries.length && !pendingMoves.length) {
    console.log('\nYazılacak yeni kalem yok.\n')
    return
  }

  console.log(`\nDEPO: #${depo.no} ${depo.name}`)
  console.log(`Yazılacak — mal kalemi: ${pendingEntries.length}  ·  bölge kasası: ${pendingMoves.length}`)
  for (const { row, p } of pendingEntries) {
    const birim = p.unit === 'CASE' ? 'kg' : p.unit === 'BUNCH' ? 'bağ' : 'adet'
    console.log(`  ${String(row.kasa).padStart(4)} kasa · ${p.name} · ${row.miktar} ${birim}${row.siyah ? ' · siyah' : ''}${row.zayif ? ' · zayıf' : ''}`)
  }
  for (const { row, r } of pendingMoves) console.log(`  ${String(row.kasa).padStart(4)} kasa → ${r.name}`)

  if (!apply) {
    console.log('\nKuru çalışma. Yazmak için: --yes\n')
    return
  }

  // Tek transaction: sayım bütünlüklü bir fotoğraf, yarısı yazılmış hali işe yaramaz.
  const result = await prisma.$transaction(async (tx) => {
    const created = []
    for (const { row, p } of pendingEntries) {
      created.push(await tx.entry.create({
        data: {
          regionSessionId: null,      // ofis girişi — bölge oturumu yok
          productId: p.id,
          producerId: null,           // açılış sayımı, üreticiye bağlanmaz
          qualityId: null,
          caseCount: row.kasa,
          weight: row.miktar,
          unit: p.unit,
          weak: row.zayif,
          disposableCase: row.siyah,
          bQuality: false,
          source: 'HARVEST',
          marketId: depo.id,
          createdBy: CREATED_BY,
        },
      }))
    }

    const moves = []
    for (const { row, r } of pendingMoves) {
      moves.push(await tx.caseMovement.create({
        data: {
          type: 'REGION_OUT',
          qty: row.kasa,
          regionId: r.id,
          note: '22.08.2026 sayımı — şoför üzerindeki kasa',
          createdBy: CREATED_BY,
        },
      }))
    }
    return { created, moves }
  })

  console.log(`\n✓ ${result.created.length} depo kaydı, ${result.moves.length} bölge kasa hareketi yazıldı.\n`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
