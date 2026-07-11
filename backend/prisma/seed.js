import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import { iconFor } from './productEmoji.js'

const prisma = new PrismaClient()

async function main() {
  console.log('Seed başlıyor...')

  // İlk admin kullanıcısını upsert et (mevcut User'lara dokunma)
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD ?? 'admin123'
  const adminHash = await bcrypt.hash(adminPassword, 10)
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash: adminHash, roles: ['ADMIN'], active: true },
    create: { username: 'admin', name: 'Admin', passwordHash: adminHash, roles: ['ADMIN'], active: true },
  })
  console.log('İlk admin kullanıcısı hazır (username: admin)')

  await prisma.exitItem.deleteMany()
  await prisma.exit.deleteMany()
  await prisma.entry.deleteMany()
  await prisma.vehicleSession.deleteMany()
  await prisma.driver.deleteMany()
  await prisma.producer.deleteMany()
  await prisma.product.deleteMany()
  await prisma.quality.deleteMany()
  await prisma.market.deleteMany()

  const qualities = await prisma.quality.createMany({
    data: [{ name: 'A' }, { name: 'B' }],
  })
  console.log(`${qualities.count} kalite eklendi`)

  const producers = await prisma.producer.createMany({
    data: [
      { name: 'Mehmet Üretici' },
      { name: 'Ayşe Bahçe' },
      { name: 'Yusuf Tarım' },
      { name: 'Fatma Sera' },
      { name: 'Mustafa Çiftçi' },
    ],
  })
  console.log(`${producers.count} üretici eklendi`)

  const drivers = await prisma.driver.createMany({
    data: [
      { name: 'Ahmet Yılmaz' },
      { name: 'Mehmet Kaya' },
      { name: 'Ali Demir' },
      { name: 'Hasan Çelik' },
      { name: 'İbrahim Şahin' },
    ],
  })
  console.log(`${drivers.count} şoför eklendi`)

  // Gerçek ürün kataloğu — ana ürün gruplaması isimden türetilir (bkz. frontend/utils/productGroups.js)
  const PRODUCT_NAMES = [
    'ACUR', 'ALIÇ', 'ASMA YAPRAĞI', 'AVAKADO', 'AYŞE FASULYE', 'AYVA',
    'BAKLA TAZE', 'BAMYA', 'BARBUNYA', 'BERGAMUT', 'BEZELYE',
    'BİBER ACI KIRMIZI', 'BİBER ACI YEŞİL', 'BİBER ÇARLİ SARI', 'BİBER ÇARLİ SERA',
    'BİBER DOL.SARI', 'BİBER DOL.YEŞİL', 'BİBER HATAY', 'BİBER KAPYA', 'BİBER MEKSİKA ACI',
    'BROKOLİ', 'CEVİZ BİDON', 'ÇAĞLA BADEM PAKET', 'ÇİÇEK LAHANASI',
    'ÇİLEK AÇIK', 'ÇİLEK PKT', 'DARI', 'DERE OTU',
    'DOMATES BARDAK', 'DOMATES ÇERİ PKT', 'DOMATES ÇERİ YERLİ', 'DOMATES SERA',
    'DRAGON AD.', 'DRAGON KG', 'DUT PAKET', 'ELMA YERLİ',
    'ENGİNAR GÖBEK', 'ENGİNAR YAN',
    'ERİK FORMOZA', 'ERİK KIRMIZI', 'ERİK YEŞİL', 'ERİK YEŞİL PKT',
    'GINNAP', 'GOLYANDRO', 'GÖMEÇ', 'GREYFUT YERLİ', 'GUAFA', 'GULUMBRA',
    'HAVUÇ', 'HURMA CENNET YERLİ', 'ISPANAK BAĞ', 'İNCİR A',
    'KABAK', 'KABAK BAL', 'KABAK ET', 'KABAK KIRMIZI', 'KABAK MACUNLUK', 'KABAK TOPAK',
    'KAKİ', 'KARPUZ YERLİ', 'KAVUN ANANAS', 'KAVUN KIŞ', 'KAYISI', 'KAYSI PAKET',
    'KEKİK', 'KEREVİZ', 'KOLOKAS', 'LİMON YEDİVEREN', 'LUANA',
    'MANDALİN KİNG', 'MANDALİN KLEMENTİN', 'MANDALİN ORİ', 'MANDALİN SAKSUMA',
    'MANDALİN TURUNÇ', 'MANDALİN W MARCO', 'MANDALİN YERLİ', 'MANDALİNA NOVA',
    'MANGO YERLİ', 'MARUL', 'MARUL KIVIRCIK', 'MARUL LOLOROSSO', 'MARUL LOLOROSSO KIRMIZI',
    'MAYDANOZ', 'MERSİN PKT ADET', 'MUZ YERLİ', 'NAR TATLI', 'NEKTARİN YERLİ', 'NERGİS',
    'PAMELO', 'PANCAR', 'PANCAR BAĞ', 'PAPAYA', 'PATATES', 'PATATES TAZE',
    'PATLICAN KIRMIZI', 'PATLICAN SİYAH', 'PATLICAN TOPAK', 'PAZI',
    'PORTAKAL KAN', 'PORTAKAL SIKMALIK', 'PORTAKAL ŞEKER', 'PORTAKAL VALENSİA',
    'PORTAKAL WASHINTON', 'PORTAKAL YAFA', 'PRATSA', 'ROKKA', 'SALATALIK', 'SARI FASULYE',
    'SARMA BEYAZ', 'SARMA EKMEK', 'SARMA MOR',
    'SARMISAK BAŞ', 'SARMISAK İRİ', 'SARMISAK KİLO', 'SARMISAK TAZE', 'SEMİZ OTU',
    'SOĞAN BAŞ', 'SOĞAN İRİ', 'SOĞAN KIRMIZI', 'SOĞAN KURU', 'SOĞAN MOR', 'SOĞAN TAZE',
    'ŞEFTALİ YERLİ', 'TAZE BÖRÜLCE', 'TAZE FASULYE', 'TAZE NANE', 'TERE OTU',
    'TURP', 'TURP KG', 'TUTKU MEYVE KG',
    'ÜZÜM SİYAH', 'ÜZÜM BEYAZ', 'ÜZÜM PARMAK(TOMSON)', 'ÜZÜM SULTANİ', 'ÜZÜM VERİGO',
    'YENİ DÜNYA KG.',
  ]
  // Türkçe başlık biçimi: her kelimenin ilk harfi büyük, gerisi küçük (İ/I doğru)
  const titleCaseTr = (s) =>
    s.toLocaleLowerCase('tr').replace(/(^|[\s(.\-/])(\p{L})/gu, (_, sep, ch) => sep + ch.toLocaleUpperCase('tr'))

  // Ana ürün (groupName) — ilk kelimeden türetilir; sadece 2+ üyeli gruplara atanır.
  // Sonradan admin panelden elle düzenlenebilir (ör. "Ayşe Fasulye" → "Fasulye").
  const ALIASES = { MANDALİNA: 'MANDALİN', KAYSI: 'KAYISI' }
  const STOPWORDS = new Set(['TAZE'])
  const groupKey = (name) => {
    const first = name.trim().replace(/\s+/g, ' ').split(' ')[0].toLocaleUpperCase('tr')
    if (STOPWORDS.has(first)) return name.toLocaleUpperCase('tr') // tekil kalsın
    return ALIASES[first] ?? first
  }
  const keyCount = {}
  for (const n of PRODUCT_NAMES) keyCount[groupKey(n)] = (keyCount[groupKey(n)] ?? 0) + 1

  const products = await prisma.product.createMany({
    data: PRODUCT_NAMES.map((name) => {
      const key = groupKey(name)
      const displayName = titleCaseTr(name)
      return {
        name: displayName,
        groupName: keyCount[key] >= 2 ? titleCaseTr(key) : null,
        icon: iconFor(displayName),
      }
    }),
  })
  console.log(`${products.count} ürün eklendi (groupName otomatik atandı)`)

  const markets = await prisma.market.createMany({
    data: Array.from({ length: 20 }, (_, i) => ({
      no: i + 1,
      name: `Pazar ${i + 1}`,
    })),
  })
  console.log(`${markets.count} market eklendi`)

  console.log('Seed tamamlandı!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
