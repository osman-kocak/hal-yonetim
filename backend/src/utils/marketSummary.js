// İrsaliye başlığındaki bayi özeti: üstünde duran kasa + cari borç.
//
// Fiş bayiye elden veriliyor; "kaç kasam var, ne kadar borcum var" sorusu
// kâğıdın üstünde cevaplanmalı. Rakamlar BASIM ANINDAKİ güncel değerlerdir,
// fişin kesildiği andaki değil — Exit'e dondurulmuş kolon yazılmıyor, dolayısıyla
// eski bir fiş yeniden basılırsa üstünde bugünkü bakiye çıkar.
//
// İşaret mantığı KOPYALANMADI: iki controller'ın kendi signFor'u import ediliyor.
// Yeni bir hareket tipi eklendiğinde tek yerde güncellenir, fiş sessizce
// ayrışmaz.
import { prisma } from './prismaClient.js'
import { signFor as caseSign } from '../controllers/caseMovementController.js'
import { signFor as ledgerSign } from '../controllers/ledgerController.js'

// Birden çok pazar için tek turda özet. History listesi sayfa başına onlarca
// irsaliye döndürüyor; pazar başına ayrı sorgu N+1 olurdu.
//
// Dönen: { [marketId]: { caseBalance, debt } } — hiç hareketi olmayan pazar da
// 0/0 ile yer alır, çağıran ?? ile uğraşmasın.
export async function marketSummaries(marketIds) {
  const ids = [...new Set((marketIds ?? []).filter((id) => id != null).map(Number))]
  const out = {}
  if (!ids.length) return out
  for (const id of ids) out[id] = { caseBalance: 0, debt: 0 }

  const [caseGroups, ledgerGroups] = await Promise.all([
    prisma.caseMovement.groupBy({
      by: ['marketId', 'type'],
      where: { marketId: { in: ids } },
      _sum: { qty: true },
    }),
    prisma.ledgerEntry.groupBy({
      by: ['marketId', 'type'],
      where: { marketId: { in: ids } },
      _sum: { amount: true },
    }),
  ])

  for (const g of caseGroups) {
    out[g.marketId].caseBalance += caseSign(g.type) * (g._sum.qty ?? 0)
  }
  for (const g of ledgerGroups) {
    out[g.marketId].debt += ledgerSign(g.type) * (g._sum.amount ?? 0)
  }
  // Kuruş artıklarını temizle — 0.1 + 0.2 kalıntısı fişte "18.499,999999" basar.
  for (const id of ids) out[id].debt = Math.round(out[id].debt * 100) / 100

  return out
}

// Tek pazar için kısayol. Çıkış oluşturma/düzenleme tek irsaliye döndürüyor.
export async function marketSummary(marketId) {
  const all = await marketSummaries([marketId])
  return all[marketId] ?? { caseBalance: 0, debt: 0 }
}
