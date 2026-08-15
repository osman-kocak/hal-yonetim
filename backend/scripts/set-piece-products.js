#!/usr/bin/env node
/**
 * Adetle satılan ürünleri PIECE birimine çevirir.
 *
 * NEDEN AYRI BİRİM: bağ ve adet tek kovada toplanıyordu ("230 bağ/adet").
 * 150 bağ maydanoz ile 80 adet lahana toplanabilir sayı değil; muhasebe ikisini
 * ayrı görmek istiyor. Bağ listesi olduğu gibi kalır (scripts/set-bunch-products.js),
 * bu script yalnızca ADET olacak ürünleri ayırır.
 *
 * NEDEN MIGRATION DEĞİL: `prisma migrate deploy` her deploy'da bekleyen tüm
 * migration'ları uygular; bu geçişin gün sonunda yapılması gerekiyor ve deploy
 * zamanlamasına bağlanamaz. Aynı gerekçe set-bunch-products.js'te de yazılı.
 *
 * KULLANIM:
 *   node scripts/set-piece-products.js            # kontrol et, DEĞİŞTİRME (dry run)
 *   node scripts/set-piece-products.js --apply    # uygula
 *
 * NE ÇEVİRİYOR: Product.unit + GEÇMİŞ DAHİL tüm Entry.unit ve ReturnRecord.unit.
 * Geçmişi de çeviriyoruz çünkü bu ürünlerin weight kolonunda zaten SAYI duruyor;
 * yalnızca o sayının adı değişiyor. Çevirmezsek eski kayıtlar bağ toplamında,
 * yenileri adet toplamında görünür ve iki rapor birbirini tutmaz.
 *
 * caseCount'a DOKUNULMUYOR: kasa sayımı 2026-08-13'ten beri birimden bağımsız
 * (bkz. utils/cases.js). Sıfırlamak bölge/bayi bakiyesini karşılıksız bırakırdı.
 *
 * FİYAT GUARD'I — kaynağa göre:
 *   BUNCH → PIECE : finansal olarak NÖTR. pricePerKg iki tarafta da "sayı başına
 *                   fiyat" (₺/bağ → ₺/adet); tutar formülü (fiyat × weight)
 *                   değişmiyor. Guard uygulanmaz.
 *   CASE  → PIECE : RİSKLİ. ₺/kg fiyatı ₺/adet'e dönüşür, geçmiş tutarların
 *                   anlamı kayar. Bu ürünlerde fiyat/tutar kaydı varsa durur.
 */
import { prisma } from '../src/utils/prismaClient.js'

// Osman'ın vereceği liste buraya. ID ile yazılır, AD ile DEĞİL: ürün adları
// admin panelden değiştirilebiliyor ve ad eşleşmesi sessizce ıskalayıp ürünü
// eski biriminde bırakırdı (aynı gerekçe set-bunch-products.js'te de yazılı).
// Üretim veritabanından ID doğrulanmadan --apply ÇALIŞTIRMA.
const PIECE_PRODUCT_IDS = [
  // örn. 55,  // Kabak Bal
]

const apply = process.argv.includes('--apply')

async function main() {
  if (!PIECE_PRODUCT_IDS.length) {
    console.error(
      'HATA: PIECE_PRODUCT_IDS boş.\n' +
      'Adet olacak ürünlerin ID listesi bu dosyaya yazılmalı. ID doğrulaması için:\n' +
      '  SELECT id, name, unit FROM "Product" ORDER BY name;'
    )
    process.exit(1)
  }

  const products = await prisma.product.findMany({
    where: { id: { in: PIECE_PRODUCT_IDS } },
    select: { id: true, name: true, unit: true },
    orderBy: { id: 'asc' },
  })

  const missing = PIECE_PRODUCT_IDS.filter((id) => !products.some((p) => p.id === id))
  if (missing.length) {
    console.error(`HATA: şu ürün ID'leri veritabanında yok: ${missing.join(', ')}`)
    process.exit(1)
  }

  console.log(`\n${products.length} ürün listede:`)
  for (const p of products) {
    const flag = p.unit === 'PIECE' ? 'zaten ADET'
      : p.unit === 'BUNCH' ? 'BAĞ → ADET (fiyat anlamı değişmez)'
        : 'KİLO → ADET (fiyat anlamı DEĞİŞİR)'
    console.log(`  ${String(p.id).padStart(3)}  ${p.name.padEnd(28)} ${flag}`)
  }

  // GUARD yalnızca CASE'ten gelenler için: onların fiyatı ₺/kg varsayımıyla
  // hesaplandı, birim değişince o tutarların anlamı kayar.
  const fromCase = products.filter((p) => p.unit === 'CASE').map((p) => p.id)
  if (fromCase.length) {
    const [pricedItems, priceRows, returnAmount] = await Promise.all([
      prisma.exitItem.count({
        where: { pricePerKg: { not: null }, entry: { productId: { in: fromCase } } },
      }),
      prisma.price.count({ where: { productId: { in: fromCase } } }),
      prisma.returnRecord.aggregate({
        where: { productId: { in: fromCase } },
        _sum: { amount: true },
      }),
    ])
    const returnTotal = returnAmount._sum.amount ?? 0

    if (pricedItems > 0 || priceRows > 0 || Math.abs(returnTotal) > 0.001) {
      console.error(
        '\nİPTAL: kilo biriminden gelen ürünlerde fiyat/tutar kaydı var —' +
        `\n  ürün ID'leri                : ${fromCase.join(', ')}` +
        `\n  fiyatlanmış irsaliye kalemi : ${pricedItems}` +
        `\n  Price tablosu kaydı         : ${priceRows}` +
        `\n  iade tutarı                 : ${returnTotal} ₺` +
        '\n\nO tutarlar ₺/kg varsayımıyla hesaplandı; adete çevirmek anlamlarını' +
        '\nkaydırır. Önce muhasebeyle birlikte incelenmeli.'
      )
      process.exit(1)
    }
  }

  const [entryCount, returnCount] = await Promise.all([
    prisma.entry.count({ where: { productId: { in: PIECE_PRODUCT_IDS }, unit: { not: 'PIECE' } } }),
    prisma.returnRecord.count({ where: { productId: { in: PIECE_PRODUCT_IDS }, unit: { not: 'PIECE' } } }),
  ])

  const toChange = products.filter((p) => p.unit !== 'PIECE')
  if (!toChange.length && entryCount === 0 && returnCount === 0) {
    console.log('\nDeğişecek kayıt yok — hepsi zaten ADET.')
    return
  }

  console.log(
    `\nÇevrilecek: ${toChange.length} ürün · ${entryCount} giriş kaydı · ${returnCount} iade kaydı` +
    '\n(geçmiş dahil — bu ürünlerde weight kolonu zaten sayı tutuyor)' +
    '\nKasa (caseCount) değişmiyor: kasa sayımı birimden bağımsız.'
  )

  if (!apply) {
    console.log('\n[DRY RUN] hiçbir şey değiştirilmedi. Uygulamak için: --apply')
    return
  }

  // Tek transaction: ürün PIECE olup girişler BUNCH kalırsa depo ekranı aynı
  // ürünü iki ayrı grupta gösterir ve toplamlar iki kovaya bölünür.
  const done = await prisma.$transaction(async (tx) => {
    const prod = await tx.product.updateMany({
      where: { id: { in: PIECE_PRODUCT_IDS }, unit: { not: 'PIECE' } },
      data: { unit: 'PIECE' },
    })
    const entry = await tx.entry.updateMany({
      where: { productId: { in: PIECE_PRODUCT_IDS }, unit: { not: 'PIECE' } },
      data: { unit: 'PIECE' },
    })
    const ret = await tx.returnRecord.updateMany({
      where: { productId: { in: PIECE_PRODUCT_IDS }, unit: { not: 'PIECE' } },
      data: { unit: 'PIECE' },
    })
    return { prod: prod.count, entry: entry.count, ret: ret.count }
  })

  console.log(
    `\n✓ ${done.prod} ürün · ${done.entry} giriş · ${done.ret} iade kaydı ADET birimine çevrildi.` +
    '\n\nMuhasebeciye bildir: bu ürünlerin fiyat hücresi artık ₺/adet.'
  )
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
