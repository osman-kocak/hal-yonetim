// Bölge + üretici import'u — Excel kaynaklı, IDEMPOTENT.
//
// Kullanım:
//   npm run db:import-producers -- --dry-run     # hiçbir şey yazmaz, ne olacağını gösterir
//   npm run db:import-producers                  # gerçek
//   npm run db:import-producers -- --deactivate-missing   # Excel'de olmayanları pasife al (opt-in)
//
// Neden backend/scripts/ altında: @prisma/client'a backend/node_modules'dan erişiyor ve
// deploy.sh sadece backend/'i rsync'liyor — kök scripts/ VPS'e gitmiyor.
//
// Mevcut üreticileri ASLA silmez. Eşleşmeyenleri raporlar, dokunmaz.
//
// ⚠ Veri dosyası (producers.data.js) gerçek üretici isimleri içerdiği için
// .gitignore'da — repo açık kaynak. Yoksa: cp producers.data.example.js producers.data.js

import { PrismaClient } from '@prisma/client'
import { normalizeTr, titleCaseTr, foldTr } from '../src/utils/turkish.js'
import {
  PRODUCERS,
  ALL_REGIONS_MARKER_RAW,
  EXPECTED_PRODUCER_COUNT,
  EXPECTED_REGION_COUNT,
} from './producers.data.js'

const ALL_REGIONS_MARKER = normalizeTr(ALL_REGIONS_MARKER_RAW)
const isAllRegionsMarker = (raw) => normalizeTr(raw) === ALL_REGIONS_MARKER

class DryRunRollback extends Error {}

/**
 * Bölgeleri ve üreticileri idempotent şekilde yazar.
 * seed.js de bunu çağırır — tek kaynak.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 */
export async function importProducers(tx, { log = console.log, deactivateMissing = false } = {}) {
  // ---- Fail-fast: veri dosyası beklediğimiz gibi mi? (tek satır yazmadan önce) ----
  if (PRODUCERS.length !== EXPECTED_PRODUCER_COUNT) {
    throw new Error(`Veri dosyası bozuk: ${PRODUCERS.length} satır, ${EXPECTED_PRODUCER_COUNT} bekleniyordu`)
  }
  const allRegionsRows = PRODUCERS.filter((p) => isAllRegionsMarker(p.region))
  if (allRegionsRows.length !== 1) {
    throw new Error(`"Hepsinde" işaretli ${allRegionsRows.length} üretici var, 1 bekleniyordu`)
  }
  const regionNames = [...new Set(PRODUCERS.filter((p) => !isAllRegionsMarker(p.region)).map((p) => titleCaseTr(p.region)))]
  if (regionNames.length !== EXPECTED_REGION_COUNT) {
    throw new Error(`${regionNames.length} bölge çıktı, ${EXPECTED_REGION_COUNT} bekleniyordu: ${regionNames.join(', ')}`)
  }
  // Fold anahtarı altında mükerrer — ham karşılaştırmanın yakalamadığını yakalar
  const keys = PRODUCERS.map((p) => foldTr(p.name))
  const dupKeys = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))]
  if (dupKeys.length) {
    throw new Error(`Veri dosyasında mükerrer isim (normalize edilmiş): ${dupKeys.join(', ')}`)
  }

  // ---- Bölgeler ----
  // update: {} KASITLI — admin bir bölgeyi pasife aldıysa tekrar çalıştırma onu diriltmemeli.
  // Sadece create active:true yazar.
  const regionByName = new Map()
  let regionsCreated = 0
  for (const name of regionNames) {
    const before = await tx.region.findUnique({ where: { name } })
    const region = await tx.region.upsert({ where: { name }, create: { name, active: true }, update: {} })
    if (!before) regionsCreated++
    regionByName.set(name, region)
  }
  log(`Bölgeler:   ${regionNames.length - regionsCreated} mevcut, ${regionsCreated} yeni`)

  // ---- Üreticiler ----
  // İdempotans anahtarı = kaydedilecek nihai form: titleCaseTr(excelName).
  // upsert KULLANILMAZ: Producer.name'de @unique yok (bkz. plan §1) ve upsert
  // sadece tam eşleşir — farklı yazımla duran satırı görmez, mükerrer yaratırdı.
  const stats = { created: [], renamed: [], updated: 0, conflicts: [] }

  for (const row of PRODUCERS) {
    const name = titleCaseTr(row.name)
    const allRegions = isAllRegionsMarker(row.region)
    const regionId = allRegions ? null : regionByName.get(titleCaseTr(row.region)).id
    const data = { regionId, allRegions }

    // 1) Tam eşleşme
    let existing = await tx.producer.findFirst({ where: { name } })

    // 2) Fold fallback — satır farklı yazımla mevcut olabilir (biri elle "AHMET YILMAZ" yazmış).
    //    Canonical'e rename et, id'yi KORU: id Entry.producerId / LedgerEntry.producerId
    //    tarafından referanslanıyor, mükerrer yaratmak geçmişi hayalet üreticide bırakırdı.
    let renamedFrom = null
    if (!existing) {
      const key = foldTr(row.name)
      const candidates = (await tx.producer.findMany()).filter((p) => foldTr(p.name) === key)
      if (candidates.length > 1) {
        // 3) Belirsiz — tahmin etme
        stats.conflicts.push({ name, candidates: candidates.map((c) => `#${c.id} "${c.name}"`) })
        continue
      }
      if (candidates.length === 1) {
        existing = candidates[0]
        renamedFrom = existing.name
      }
    }

    if (existing) {
      const refs = await countRefs(tx, existing.id)
      await tx.producer.update({ where: { id: existing.id }, data: { name, ...data } })
      if (renamedFrom) stats.renamed.push({ from: renamedFrom, to: name, id: existing.id, ...refs })
      else stats.updated++
    } else {
      await tx.producer.create({ data: { name, ...data } })
      stats.created.push({ name, region: allRegions ? 'TÜM BÖLGELER' : titleCaseTr(row.region) })
    }
  }

  // ---- Excel'de olmayan mevcut üreticiler ----
  const excelNames = new Set(PRODUCERS.map((p) => foldTr(p.name)))
  const missing = (await tx.producer.findMany({ orderBy: { name: 'asc' } })).filter(
    (p) => !excelNames.has(foldTr(p.name)),
  )

  if (deactivateMissing && missing.length) {
    await tx.producer.updateMany({ where: { id: { in: missing.map((p) => p.id) } }, data: { active: false } })
  }

  // ---- Rapor ----
  log(`Üreticiler: ${stats.updated} güncellendi, ${stats.created.length} oluşturuldu, ` +
      `${stats.renamed.length} yeniden adlandırıldı, ${stats.conflicts.length} çakışma`)

  if (stats.created.length) {
    // Her ismi yazdır: Türkçe title case ASCII yazılmış girdiyi bozabilir
    // ("ISMAIL" -> "Ismaıl"). Algoritma değil, insan yakalar.
    log(`\n  + OLUŞTURULAN (${stats.created.length}) — isimleri kontrol edin:`)
    for (const c of stats.created) log(`      ${c.name.padEnd(28)} → ${c.region}`)
  }
  if (stats.renamed.length) {
    log(`\n  ~ YENİDEN ADLANDIRILAN (${stats.renamed.length}) — id korundu, geçmiş bağlı kaldı:`)
    for (const r of stats.renamed) {
      log(`      "${r.from}" → "${r.to}"  (id ${r.id}, ${r.entries} entry, ${r.ledger} ledger)`)
    }
  }
  if (stats.conflicts.length) {
    log(`\n  ⚠ ÇAKIŞMA (${stats.conflicts.length}) — birden fazla aday, tahmin edilmedi, ATLANDI:`)
    for (const c of stats.conflicts) log(`      "${c.name}" ← ${c.candidates.join(' | ')}`)
    log(`    Çözüm: mükerrerleri admin panelden birleştirin (entry/ledger sahibi id'yi koruyun), sonra tekrar çalıştırın.`)
  }
  if (missing.length) {
    log(`\n  ⚠ EXCEL'DE YOK (${missing.length}) — ${deactivateMissing ? 'PASİFE ALINDI' : 'bunlar hiçbir bölge listesinde GÖRÜNMEYECEK'}:`)
    for (const m of missing) {
      const refs = await countRefs(tx, m.id)
      log(`      ${m.name.padEnd(28)} (${refs.entries} entry, ${refs.ledger} ledger)`)
    }
    if (!deactivateMissing) {
      log(`    Çözüm: admin panelden bölge atayın veya pasife alın. Script bunlara dokunmadı.`)
      log(`    (Otomatik pasife almak için: --deactivate-missing)`)
    }
  }

  return { stats, missing, regionsCreated }
}

async function countRefs(tx, producerId) {
  const [entries, ledger] = await Promise.all([
    tx.entry.count({ where: { producerId } }),
    tx.ledgerEntry.count({ where: { producerId } }),
  ])
  return { entries, ledger }
}

// ---- CLI ----
async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const deactivateMissing = process.argv.includes('--deactivate-missing')
  const prisma = new PrismaClient()

  console.log(dryRun ? '🔎 DRY RUN — hiçbir değişiklik kaydedilmeyecek\n' : '📥 Import başlıyor\n')

  try {
    await prisma.$transaction(
      async (tx) => {
        const { stats, missing } = await importProducers(tx, { deactivateMissing })
        if (stats.conflicts.length) {
          process.exitCode = 1
        }
        // Dry-run GERÇEK yazma yolunu çalıştırıp rollback atar — sadece simüle etmez.
        // Böylece bir constraint ihlali prod'da değil, burada yüzeye çıkar.
        if (dryRun) throw new DryRunRollback(String(missing.length))
      },
      // 165 üretici × 2+ sorgu; varsayılan 5sn yetmez
      { timeout: 120_000, maxWait: 10_000 },
    )
    console.log('\n✅ Tamamlandı.')
  } catch (err) {
    if (err instanceof DryRunRollback) {
      console.log('\n🔎 DRY RUN bitti — hiçbir değişiklik kaydedilmedi.')
      console.log('   Yukarıdaki isimleri okuyup onayladıktan sonra --dry-run olmadan çalıştırın.')
    } else {
      console.error('\n❌ HATA:', err.message)
      process.exitCode = 1
    }
  } finally {
    await prisma.$disconnect()
  }
}

// Sadece doğrudan çalıştırıldığında CLI'ı aç (seed.js import ederken değil)
if (process.argv[1] && process.argv[1].endsWith('import-producers.js')) {
  main()
}
