import { prisma } from '../utils/prismaClient.js'
import { paginated, parsePagination } from '../utils/pagination.js'
import { startOfLocalDay, endOfLocalDay } from '../utils/date.js'

// Saha kesinti ölçümü.
//
// Veri iPad'de toplanıyor (store/connectionStore.js) ve bağlantı gelince buraya
// gönderiliyor. Sunucu kesinti sırasında zaten erişilemez olduğu için ölçümü
// sunucu yapamaz — istemcinin gönderdiğine güveniliyor.

const MAX_BATCH = 200

// Toplu gönderim. Aynı kesinti tekrar gelirse yazılmaz: (deviceId, startedAt)
// UNIQUE ve skipDuplicates kullanılıyor — istemci "gönderdim mi" durumunu
// güvenilir şekilde saklayamaz (kesintide sekme ölebilir), o yüzden tekrar
// göndermek normal kabul ediliyor.
export async function reportOutages(req, res, next) {
  try {
    const { deviceId, outages } = req.body
    if (!deviceId || !Array.isArray(outages)) {
      return res.status(400).json({ error: 'deviceId ve outages zorunlu' })
    }
    if (!outages.length) return res.json({ saved: 0 })
    if (outages.length > MAX_BATCH) {
      return res.status(400).json({ error: `En fazla ${MAX_BATCH} kayıt gönderilebilir` })
    }

    const username = req.user?.username ?? req.user?.name ?? null
    const rows = []
    for (const o of outages) {
      const start = new Date(o?.start)
      const end = new Date(o?.end)
      const ms = Number(o?.ms)
      // Bozuk kayıt tüm partiyi düşürmesin — sessizce atlanır. Ölçüm verisi
      // kritik değil, eksik satır tolere edilebilir.
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue
      if (!Number.isFinite(ms) || ms <= 0) continue
      rows.push({ deviceId: String(deviceId).slice(0, 64), username, startedAt: start, endedAt: end, ms: Math.round(ms) })
    }
    if (!rows.length) return res.json({ saved: 0 })

    const result = await prisma.outageReport.createMany({ data: rows, skipDuplicates: true })
    res.json({ saved: result.count })
  } catch (err) { next(err) }
}

// Admin listesi + özet. Özet SAYFADAN BAĞIMSIZ hesaplanıyor: 50 satırlık sayfanın
// toplamı "bu ay ne kadar kesinti oldu" sorusuna cevap vermez.
export async function listOutages(req, res, next) {
  try {
    const { dateFrom, dateTo, deviceId } = req.query
    const where = {}
    if (deviceId) where.deviceId = String(deviceId)
    if (dateFrom || dateTo) {
      where.startedAt = {}
      if (dateFrom) where.startedAt.gte = startOfLocalDay(dateFrom)
      if (dateTo) where.startedAt.lte = endOfLocalDay(dateTo)
    }

    const pg = parsePagination(req)
    const [rows, total, agg, devices] = await Promise.all([
      prisma.outageReport.findMany({
        where, orderBy: { startedAt: 'desc' }, skip: pg.skip, take: pg.limit,
      }),
      prisma.outageReport.count({ where }),
      prisma.outageReport.aggregate({ where, _sum: { ms: true }, _max: { ms: true }, _avg: { ms: true } }),
      prisma.outageReport.groupBy({ by: ['deviceId'], where, _count: { id: true }, _sum: { ms: true } }),
    ])

    res.json({
      ...paginated(rows, total, pg),
      summary: {
        count: total,
        totalMs: agg._sum.ms ?? 0,
        longestMs: agg._max.ms ?? 0,
        avgMs: Math.round(agg._avg.ms ?? 0),
        // Cihaz kırılımı: kesinti tek bir iPad'de mi (cihaz/ağ sorunu) yoksa
        // hepsinde birden mi (hat sorunu) — karar bu ayrıma bağlı.
        devices: devices
          .map((d) => ({ deviceId: d.deviceId, count: d._count.id, totalMs: d._sum.ms ?? 0 }))
          .sort((a, b) => b.totalMs - a.totalMs),
      },
    })
  } catch (err) { next(err) }
}
