import { prisma } from './prismaClient.js'

// Özel pazarlar — bayi değiller, normal satış/irsaliye akışının dışındalar.
// Kodda no === 0 kontrolü dağınık haldeydi ve 99 hiçbir yerde tanınmıyordu;
// 99'a entry yazılmaya başlayınca ATILAN normal bir pazar gibi davranıp
// irsaliye kesilebilir ve ciro raporlarına karışabilirdi.
export const DEPO_NO = 0
export const DISCARD_NO = 99 // ATILAN — imha edilen mal buraya yazılır

export const SPECIAL_MARKET_NOS = [DEPO_NO, DISCARD_NO]

export function isSpecialMarket(market) {
  return market != null && SPECIAL_MARKET_NOS.includes(market.no)
}

export function findDepoMarket(client = prisma) {
  return client.market.findFirst({
    where: { OR: [{ no: DEPO_NO }, { name: 'DEPO' }] },
    orderBy: { id: 'asc' },
  })
}

export function findDiscardMarket(client = prisma) {
  return client.market.findFirst({
    where: { no: DISCARD_NO },
    orderBy: { id: 'asc' },
  })
}
