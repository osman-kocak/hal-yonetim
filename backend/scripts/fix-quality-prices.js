#!/usr/bin/env node
/**
 * Eski kaliteli fiyat satırlarını GENEL fiyata çeker (qualityId → null).
 *
 * SORUN: Kalite özelliği 2026-08-13'te kullanımdan kalktı ve kod tarafı
 * düzeltildi (utils/prices.js → priceOf artık genel fiyata düşüyor), ama VERİ
 * taşınmadı: fiyatların bir kısmı hâlâ `qualityId` dolu satırda duruyor.
 * Saha girişleri ise `Entry.qualityId = null` üretiyor — üretimde bu alanın
 * dolu olduğu TEK BİR kayıt bile yok. Anahtar tutmadığı için o ürünlerin
 * fiyatı bulunamıyor:
 *
 *   Price(productId=12, qualityId=5, 40 TL)   →  map anahtarı "12_5"
 *   Entry(productId=12, qualityId=null)       →  aranan anahtar "12"   ✗
 *
 * Sonucu sadece "irsaliyede — görünmesi" değil: fiyat okunamayınca
 * exitController `invoiceTotal = 0` hesaplıyor ve `if (invoiceTotal > 0)`
 * koşulu yüzünden bayiye MARKET_INVOICE borç kaydı SESSİZCE hiç yazılmıyor.
 * 2026-08-15 ölçümünde 28 ürün bu durumdaydı ve 905 satış kalemini etkiliyordu
 * (Bamya, Havuç, Karpuz, Limon, Greyfurt gibi ana ürünler).
 *
 * KULLANIM:
 *   node scripts/fix-quality-prices.js            # kontrol et (dry run)
 *   node scripts/fix-quality-prices.js --apply    # uygula
 *
 * İDEMPOTENT: kaliteli satır kalmadıysa hiçbir şey yapmaz.
 *
 * FİYAT RAKAMINA DOKUNMAZ — satır yalnızca doğru anahtara taşınır.
 *
 * ÇAKIŞMA: aynı (ürün, gün) için hem genel hem kaliteli satır varsa genel
 * KAZANIR, kaliteli satır silinir. Sebebi hem teknik hem anlamsal: migration
 * `UNIQUE (productId, date) WHERE qualityId IS NULL` partial index'i koyuyor,
 * ikisini birden null'a çekmek onu ihlal ederdi; ayrıca genel satır muhasebecinin
 * yeni standartta bilerek girdiği değerdir, eski kaliteli rakam onu ezmemeli.
 *
 * BU SCRIPT CARİ HESABA DOKUNMAZ. Fiyatı geri gelen geçmiş irsaliyelerin
 * yazılmamış MARKET_INVOICE kayıtları KENDİLİĞİNDEN oluşmaz — o düzeltme
 * bilinçli olarak muhasebeciye bırakıldı (/admin/finans, elle giriş).
 */
import { prisma } from '../src/utils/prismaClient.js'

const apply = process.argv.includes('--apply')

const gun = (d) => d.toISOString().slice(0, 10)

async function main() {
  const kaliteli = await prisma.price.findMany({
    where: { qualityId: { not: null } },
    include: { product: { select: { name: true } } },
    orderBy: [{ productId: 'asc' }, { date: 'asc' }],
  })

  if (!kaliteli.length) {
    console.log('\nTaşınacak satır yok — tüm fiyatlar zaten genel (qualityId null).')
    return
  }

  // Aynı (ürün, gün) için genel satır zaten var mı?
  const genel = await prisma.price.findMany({
    where: { qualityId: null },
    select: { productId: true, date: true },
  })
  const genelKey = new Set(genel.map((p) => `${p.productId}|${gun(p.date)}`))

  const tasinacak = []
  const silinecek = []
  for (const p of kaliteli) {
    const key = `${p.productId}|${gun(p.date)}`
    if (genelKey.has(key)) silinecek.push(p)
    else {
      tasinacak.push(p)
      // Aynı ürün+gün için iki kaliteli satır varsa ilki taşınır, ikincisi
      // artık çakışır — sette tutup sonrakini silinecek listesine at.
      genelKey.add(key)
    }
  }

  console.log(`\nKaliteli fiyat satırı: ${kaliteli.length}`)
  console.log(`  → genel fiyata taşınacak : ${tasinacak.length}`)
  console.log(`  → silinecek (genel var)   : ${silinecek.length}\n`)

  for (const p of tasinacak) {
    console.log(`  TAŞI   ${gun(p.date)}  ${String(p.pricePerKg).padStart(8)} TL  ${p.product.name}`)
  }
  for (const p of silinecek) {
    console.log(`  SİL    ${gun(p.date)}  ${String(p.pricePerKg).padStart(8)} TL  ${p.product.name}  (genel satır zaten var)`)
  }

  // Etki ölçüsü: bu ürünlerin kaç satış kalemi fiyat bulacak?
  const etkilenen = [...new Set(tasinacak.map((p) => p.productId))]
  if (etkilenen.length) {
    const kalem = await prisma.exitItem.count({
      where: { entry: { productId: { in: etkilenen } } },
    })
    console.log(`\n${etkilenen.length} ürün, ${kalem} satış kalemi fiyat bulacak.`)
  }

  if (!apply) {
    console.log('\nDRY RUN — hiçbir şey yazılmadı. Uygulamak için: --apply')
    return
  }

  await prisma.$transaction(async (tx) => {
    for (const p of silinecek) {
      await tx.price.delete({ where: { id: p.id } })
    }
    for (const p of tasinacak) {
      await tx.price.update({ where: { id: p.id }, data: { qualityId: null } })
    }
  })

  const kalan = await prisma.price.count({ where: { qualityId: { not: null } } })
  const genelSon = await prisma.price.count({ where: { qualityId: null } })
  console.log(`\nUYGULANDI — ${tasinacak.length} taşındı, ${silinecek.length} silindi.`)
  console.log(`Şimdi: genel=${genelSon}  kaliteli=${kalan}`)
}

main()
  .catch((e) => { console.error('HATA:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
