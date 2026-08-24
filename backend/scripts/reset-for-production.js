#!/usr/bin/env node
// Canlıya geçiş öncesi tam sıfırlama.
//
// Deneme sürecinde birikmiş TÜM hareket verisi ve fiyatlar silinir, ID sayaçları
// 1'e döner (irsaliye no #1'den başlar). Sabit tanımlar korunur: ürün, bayi,
// üretici, bölge, kullanıcı, kalite.
//
// Devir YOK — cari borçlar ve kasa bakiyeleri de sıfırlanır (22 Ağu kararı).
//
// Kullanım:  node scripts/reset-for-production.js --yes
// Kuru çalışma (sadece rapor): node scripts/reset-for-production.js

import { prisma } from '../src/utils/prismaClient.js'

// TRUNCATE sırası önemsiz (tek komut + CASCADE), ama liste eksiksiz olmalı:
// CASCADE, listede olmayan bağımlı tabloyu sessizce boşaltır.
const WIPE = [
  'ExitItem', 'Exit', 'Entry', 'ReturnRecord', 'LedgerEntry', 'CaseMovement',
  'Transfer', 'RegionSession', 'Price', 'AuditLog', 'SyncedBatch',
  'OutageReport', 'ExitLock',
]

const KEEP = ['Product', 'Market', 'Producer', 'Region', 'User', 'Quality']

async function counts(tables) {
  const out = {}
  for (const t of tables) {
    const [{ count }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "${t}"`)
    out[t] = count
  }
  return out
}

async function main() {
  // Çift kilit: script her deploy'da canlıya gidiyor. Tek başına --yes, yanlış
  // terminalde geçmişten çağrılabilecek kadar kolay; env değişkeni bilinçli yazılır.
  const apply = process.argv.includes('--yes') && process.env.RESET_CONFIRM === 'SIFIRLA'
  if (process.argv.includes('--yes') && !apply) {
    console.error('\n--yes verildi ama RESET_CONFIRM=SIFIRLA yok. Silme yapılmadı.\n')
    process.exitCode = 1
    return
  }

  const before = await counts([...WIPE, ...KEEP])
  console.log('\n=== ÖNCESİ ===')
  console.log('Silinecek:', WIPE.map((t) => `${t}=${before[t]}`).join('  '))
  console.log('Korunacak:', KEEP.map((t) => `${t}=${before[t]}`).join('  '))

  if (!apply) {
    console.log('\nKuru çalışma. Gerçekten silmek için: --yes\n')
    return
  }

  const list = WIPE.map((t) => `"${t}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)

  const after = await counts([...WIPE, ...KEEP])
  console.log('\n=== SONRASI ===')
  console.log('Silinen:', WIPE.map((t) => `${t}=${after[t]}`).join('  '))
  console.log('Korunan:', KEEP.map((t) => `${t}=${after[t]}`).join('  '))

  // Sabit tanımlara CASCADE dokunmuş mu — dokunduysa yedekten dönmek gerekir.
  const damaged = KEEP.filter((t) => after[t] !== before[t])
  const leftover = WIPE.filter((t) => after[t] !== 0)
  if (damaged.length) {
    console.error(`\n!! SABİT TANIM KAYBI: ${damaged.join(', ')} — YEDEKTEN DÖN`)
    process.exitCode = 1
  } else if (leftover.length) {
    console.error(`\n!! Boşalmayan tablo: ${leftover.join(', ')}`)
    process.exitCode = 1
  } else {
    console.log('\n✓ Sıfırlama tamam. İrsaliye no #1\'den başlayacak.\n')
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
