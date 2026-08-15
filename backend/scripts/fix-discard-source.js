#!/usr/bin/env node
/**
 * 99 ATILAN pazarındaki girişlerin source'unu DISCARD'a çeker.
 *
 * SORUN: Mal kabulde doğrudan "99 ATILAN" seçilirse giriş source='HARVEST'
 * olarak kaydediliyordu. Sonuç, imha edilen malın iki yerde birden yanlış
 * görünmesi:
 *   - Fire raporu (source=DISCARD filtreli) o malı HİÇ görmüyor → ekran boş
 *   - Günlük/analitik raporlar onu mal kabul hacmine sayıyor → hacim şişkin
 *
 * Kod tarafı 2026-08-13'te düzeltildi (entryController artık 99'a giriş
 * yaparken DISCARD yazıyor). Bu script kod düzelmeden önce oluşmuş kayıtları
 * temizler.
 *
 * KULLANIM:
 *   node scripts/fix-discard-source.js            # kontrol et (dry run)
 *   node scripts/fix-discard-source.js --apply    # uygula
 *
 * İDEMPOTENT: düzeltilecek kayıt yoksa hiçbir şey yapmaz, tekrar çalıştırılabilir.
 *
 * GUARD: irsaliyesi kesilmiş kayda dokunmaz. İmha malının irsaliyesi olmaması
 * gerekir; varsa veri tutarsızdır ve elle incelenmeli — source'u değiştirmek
 * o irsaliyenin anlamını da kaydırırdı.
 */
import { prisma } from '../src/utils/prismaClient.js'
import { DISCARD_NO } from '../src/utils/markets.js'

const apply = process.argv.includes('--apply')

async function main() {
  const discardMarket = await prisma.market.findFirst({ where: { no: DISCARD_NO } })
  if (!discardMarket) {
    console.error(`HATA: ${DISCARD_NO} numaralı ATILAN pazarı tanımlı değil`)
    process.exit(1)
  }

  const wrong = await prisma.entry.findMany({
    where: { marketId: discardMarket.id, source: { not: 'DISCARD' } },
    select: {
      id: true, weight: true, unit: true, source: true, createdAt: true,
      product: { select: { name: true } },
      exitItems: { select: { id: true } },
    },
    orderBy: { id: 'asc' },
  })

  if (!wrong.length) {
    console.log('\nDüzeltilecek kayıt yok — 99 ATILAN\'daki tüm girişler zaten DISCARD.')
    return
  }

  // İrsaliyeli kayıt = veri tutarsızlığı, elle incelensin
  const invoiced = wrong.filter((e) => e.exitItems.length > 0)
  const fixable = wrong.filter((e) => e.exitItems.length === 0)

  console.log(`\n${wrong.length} kayıt 99 ATILAN'da ama source DISCARD değil:\n`)
  for (const e of wrong) {
    const birim = e.unit === 'BUNCH' ? 'bağ' : 'kg'
    const flag = e.exitItems.length ? '  ⚠ İRSALİYELİ — atlanacak' : ''
    console.log(
      `  #${String(e.id).padStart(4)}  ${e.product.name.padEnd(20)} ` +
      `${String(e.weight).padStart(6)} ${birim.padEnd(4)} ${e.source}${flag}`
    )
  }

  if (invoiced.length) {
    console.log(
      `\n⚠ ${invoiced.length} kayıt irsaliyeli olduğu için ATLANACAK.` +
      '\n  İmha malının irsaliyesi olmamalı — bu kayıtlar elle incelenmeli.'
    )
  }
  if (!fixable.length) {
    console.log('\nDüzeltilebilir kayıt yok.')
    return
  }

  const toplam = fixable.reduce((s, e) => s + e.weight, 0)
  console.log(`\nDüzeltilecek: ${fixable.length} kayıt (${Math.round(toplam * 100) / 100} birim)`)
  console.log('Etki: fire raporu bunları görmeye başlar, mal kabul hacminden düşerler.')
  console.log('Kasa hareketi ve cari hesap ETKİLENMEZ.')

  if (!apply) {
    console.log('\n[DRY RUN] hiçbir şey değiştirilmedi. Uygulamak için: --apply')
    return
  }

  const res = await prisma.entry.updateMany({
    where: { id: { in: fixable.map((e) => e.id) } },
    data: { source: 'DISCARD' },
  })
  console.log(`\n✓ ${res.count} kayıt DISCARD olarak işaretlendi.`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
