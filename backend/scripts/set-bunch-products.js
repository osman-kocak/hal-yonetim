#!/usr/bin/env node
/**
 * Bağ/adetle satılan ürünleri BUNCH birimine çevirir.
 *
 * NEDEN MIGRATION DEĞİL: `prisma migrate deploy` her deploy'da bekleyen tüm
 * migration'ları uygular. Bu geçişin gün sonunda, tüm irsaliyeler kesildikten
 * sonra yapılması gerekiyor — deploy zamanlamasına bağlanamaz. Ayrıca guard
 * ihlalinde migration patlarsa deploy yarıda kalır.
 *
 * KULLANIM:
 *   node scripts/set-bunch-products.js            # kontrol et, DEĞİŞTİRME (dry run)
 *   node scripts/set-bunch-products.js --apply    # uygula
 *
 * NE ÇEVİRİYOR: Product.unit + GEÇMİŞ DAHİL tüm Entry.unit ve ReturnRecord.unit.
 * Geçmişi de çeviriyoruz çünkü bu ürünlerde kilo alanına zaten BAĞ SAYISI
 * giriliyordu (2026-08-13'te veriyle doğrulandı: maydanozun 89 girişinde kasa
 * başı oran yalnız 5 farklı tam değer alıyor — gerçek tartı böyle olmaz;
 * karşılaştırma için Domates Sera'da her giriş farklı: 23.00, 23.11, 22.68…).
 * Yani kayıtlar zaten bağ; 'kg' etiketi baştan beri yanlıştı. Çevirmezsek
 * raporlar bu sayıları kilo toplamına katmaya devam eder.
 *
 * caseCount'a DOKUNULMUYOR: fiziksel kasalar gerçekten taşındı ve bunlar
 * CaseMovement'ta (REGION_IN) kayıtlı. Sıfırlamak geçmiş bölge bakiyesini
 * karşılıksız bırakırdı. İleriye dönük kasa sayımını trackedCases() zaten
 * BUNCH'ta 0 döndürerek kapatıyor.
 *
 * GUARD: Fiyat. Bu ürünlerde fiyatlanmış irsaliye kalemi veya Price kaydı
 * varsa çevirmez — çünkü o tutarlar ₺/kg varsayımıyla hesaplanmıştı ve birim
 * değişince anlamları kayar. (2026-08-13 kontrolü: 536 kalemin 0'ı fiyatlı,
 * Price tablosunda 0 kayıt, iade tutarı 0 ₺ → risk yok.)
 *
 * ESKİ GUARD KALDIRILDI: "irsaliyesi kesilmemiş giriş varsa dur" idi. İki
 * sebeple yanlıştı — (1) bu ürünler her gün depoya giriyor, liste hiç
 * boşalmıyordu, geçiş asla yapılamazdı; (2) korumaya çalıştığı senaryo
 * (₺/bağ × kilo) fiyat hiç girilmediği için zaten imkânsızdı.
 */
import { prisma } from '../src/utils/prismaClient.js'

// Osman'ın verdiği liste, üretim veritabanından ID ile doğrulandı (2026-08-12).
// AD ile değil ID ile: ürün adları admin panelden değiştirilebiliyor, ad
// eşleşmesi sessizce ıskalar ve ürün kasa modunda kalırdı.
const BUNCH_PRODUCT_IDS = [
  5,   // Avakado
  29,  // Dere Otu
  34,  // Dragon Ad.
  35,  // Dragon Kg
  45,  // Golyandro
  49,  // Gulumbra
  52,  // Ispanak Bağ
  55,  // Kabak Bal
  67,  // Kereviz
  80,  // Marul
  81,  // Marul Kıvırcık
  82,  // Marul Lolorosso
  83,  // Marul Lolorosso Kırmızı
  84,  // Maydanoz
  99,  // Pazı
  106, // Pratsa
  107, // Rokka
  117, // Semiz Otu
  123, // Soğan Taze
  128, // Tere Otu
  129, // Turp
  130, // Turp Kg
]

const apply = process.argv.includes('--apply')

async function main() {
  const products = await prisma.product.findMany({
    where: { id: { in: BUNCH_PRODUCT_IDS } },
    select: { id: true, name: true, unit: true },
    orderBy: { id: 'asc' },
  })

  const missing = BUNCH_PRODUCT_IDS.filter((id) => !products.some((p) => p.id === id))
  if (missing.length) {
    console.error(`HATA: şu ürün ID'leri veritabanında yok: ${missing.join(', ')}`)
    process.exit(1)
  }

  // Çevrilecek kayıt sayıları (geçmiş dahil)
  const [entryCount, returnCount] = await Promise.all([
    prisma.entry.count({ where: { productId: { in: BUNCH_PRODUCT_IDS }, unit: { not: 'BUNCH' } } }),
    prisma.returnRecord.count({ where: { productId: { in: BUNCH_PRODUCT_IDS }, unit: { not: 'BUNCH' } } }),
  ])

  console.log(`\n${products.length} ürün listede:`)
  for (const p of products) {
    const flag = p.unit === 'BUNCH' ? 'zaten BAĞ' : 'KASA → BAĞ'
    console.log(`  ${String(p.id).padStart(3)}  ${p.name.padEnd(28)} ${flag}`)
  }

  // GUARD: fiyat. Bu ürünlerde tutar hesaplanmışsa birim değişimi o tutarların
  // anlamını kaydırır — dur ve elle incelensin.
  const [pricedItems, priceRows, returnAmount] = await Promise.all([
    prisma.exitItem.count({
      where: { pricePerKg: { not: null }, entry: { productId: { in: BUNCH_PRODUCT_IDS } } },
    }),
    prisma.price.count({ where: { productId: { in: BUNCH_PRODUCT_IDS } } }),
    prisma.returnRecord.aggregate({
      where: { productId: { in: BUNCH_PRODUCT_IDS } },
      _sum: { amount: true },
    }),
  ])
  const returnTotal = returnAmount._sum.amount ?? 0

  if (pricedItems > 0 || priceRows > 0 || Math.abs(returnTotal) > 0.001) {
    console.error(
      '\nİPTAL: bu ürünlerde fiyat/tutar kaydı var —' +
      `\n  fiyatlanmış irsaliye kalemi : ${pricedItems}` +
      `\n  Price tablosu kaydı         : ${priceRows}` +
      `\n  iade tutarı                 : ${returnTotal} ₺` +
      '\n\nO tutarlar ₺/kg varsayımıyla hesaplandı; birimi çevirmek anlamlarını' +
      '\nkaydırır. Önce muhasebeyle birlikte incelenmeli.'
    )
    process.exit(1)
  }

  const toChange = products.filter((p) => p.unit !== 'BUNCH')
  if (!toChange.length && entryCount === 0 && returnCount === 0) {
    console.log('\nDeğişecek kayıt yok — hepsi zaten BAĞ.')
    return
  }

  console.log(
    `\nÇevrilecek: ${toChange.length} ürün · ${entryCount} giriş kaydı · ${returnCount} iade kaydı` +
    '\n(geçmiş dahil — bu ürünlerde kilo alanı zaten bağ sayısı tutuyor)' +
    '\nFiyat/tutar kaydı yok, finansal etki sıfır.'
  )

  if (!apply) {
    console.log('\n[DRY RUN] hiçbir şey değiştirilmedi. Uygulamak için: --apply')
    return
  }

  // Tek transaction: ürün BUNCH olup girişler CASE kalırsa depo ekranı aynı
  // ürünü iki ayrı grupta gösterir ve raporlar yarısını kiloya sayar.
  const done = await prisma.$transaction(async (tx) => {
    const prod = await tx.product.updateMany({
      where: { id: { in: BUNCH_PRODUCT_IDS }, unit: { not: 'BUNCH' } },
      data: { unit: 'BUNCH' },
    })
    const entry = await tx.entry.updateMany({
      where: { productId: { in: BUNCH_PRODUCT_IDS }, unit: { not: 'BUNCH' } },
      data: { unit: 'BUNCH' },
    })
    const ret = await tx.returnRecord.updateMany({
      where: { productId: { in: BUNCH_PRODUCT_IDS }, unit: { not: 'BUNCH' } },
      data: { unit: 'BUNCH' },
    })
    return { prod: prod.count, entry: entry.count, ret: ret.count }
  })

  console.log(
    `\n✓ ${done.prod} ürün · ${done.entry} giriş · ${done.ret} iade kaydı BAĞ birimine çevrildi.` +
    '\n\nMuhasebeciye bildir: bu ürünlerin fiyat hücresi artık ₺/bağ (₺/kg değil).'
  )
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
