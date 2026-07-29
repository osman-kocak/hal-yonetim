import { prisma } from '../utils/prismaClient.js'
import { isSpecialMarket } from '../utils/markets.js'

// pendingCount = her bayide bekleyen kasa sayısı = müşteri aktivite/hacim
// sinyali (ticari sır). Sadece çıkış (irsaliye) ekranı kullanıyor. Bu yüzden
// varsayılan olarak DÖNMEZ; yalnızca ?withPending=1 + çıkış yetkisi olan rol
// (OPERATOR/ADMIN) isterse hesaplanır. Böylece paylaşılan bayi ad+no listesi
// herkese açık kalırken aktivite verisi sızmaz.
const EXIT_ROLES = new Set(['OPERATOR', 'ADMIN'])
function canSeePending(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : (user?.role ? [user.role] : [])
  return roles.some((r) => EXIT_ROLES.has(String(r).toUpperCase()))
}

export async function getMarkets(req, res, next) {
  try {
    const withPending = req.query.withPending === '1' && canSeePending(req.user)

    const markets = await prisma.market.findMany({
      orderBy: { no: 'asc' },
      ...(withPending && {
        include: {
          _count: { select: { entries: { where: { exitItems: { none: {} } } } } },
        },
      }),
    })

    // isSpecial: DEPO (0) ve ATILAN (99) bayi değil. İstemci bunları irsaliye/
    // transfer hedefi listelerinden çıkarabilsin diye işaretliyoruz.
    const result = markets.map((m) => ({
      id: m.id,
      no: m.no,
      name: m.name,
      isSpecial: isSpecialMarket(m),
      ...(withPending && { pendingCount: m._count.entries }),
    }))

    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function getMarketEntries(req, res, next) {
  try {
    const { id } = req.params

    const entries = await prisma.entry.findMany({
      where: {
        marketId: Number(id),
        exitItems: { none: {} },
      },
      include: {
        product: true,
        quality: true,
        market: true,
        regionSession: { include: { region: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json(entries)
  } catch (err) {
    next(err)
  }
}
