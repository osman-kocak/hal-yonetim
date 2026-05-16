import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('Seed başlıyor...')

  // İlk admin kullanıcısını upsert et (mevcut User'lara dokunma)
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD ?? 'admin123'
  const adminHash = await bcrypt.hash(adminPassword, 10)
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash: adminHash, role: 'ADMIN', active: true },
    create: { username: 'admin', name: 'Admin', passwordHash: adminHash, role: 'ADMIN', active: true },
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

  const products = await prisma.product.createMany({
    data: [
      { name: 'Domates' },
      { name: 'Biber' },
      { name: 'Salatalık' },
      { name: 'Patlıcan' },
      { name: 'Soğan' },
      { name: 'Patates' },
      { name: 'Havuç' },
      { name: 'Maydanoz' },
      { name: 'Marul' },
      { name: 'Ispanak' },
      { name: 'Elma' },
      { name: 'Armut' },
      { name: 'Portakal' },
      { name: 'Mandalina' },
      { name: 'Üzüm' },
    ],
  })
  console.log(`${products.count} ürün eklendi`)

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
