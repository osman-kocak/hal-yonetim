import { prisma } from '../utils/prismaClient.js'
import { audit } from '../utils/audit.js'
import { startOfLocalDay, endOfLocalDay } from '../utils/date.js'
import { parsePagination, paginated } from '../utils/pagination.js'

// İzin verilen export kaynakları — istemci serbest metin göndermesin
const EXPORT_RESOURCES = new Set([
  'finance', 'ledger', 'returns', 'history', 'transfers',
  'case-movements', 'reports', 'fire', 'producers', 'markets', 'users',
  // Depo stoku ve depo hareket geçmişi. 'depo' listede YOKTU: DepoPage yıllardır
  // resource='depo' gönderiyor, uç 400 dönüyor ve ExportButton log hatasını
  // yutuyordu — yani depo dökümleri denetim kaydına hiç düşmemiş.
  'depo', 'depo-history',
])

// İstemci client-side export yapmadan ÖNCE bunu çağırır. Export tarayıcıda
// üretildiği için tek iz bu kayıt: kim, ne zaman, neyi, kaç satır indirdi.
export async function logExport(req, res, next) {
  try {
    const { resource, recordCount } = req.body
    if (!resource || !EXPORT_RESOURCES.has(String(resource))) {
      return res.status(400).json({ error: 'Geçersiz export kaynağı' })
    }
    const n = Number(recordCount)
    audit(req, {
      action: 'EXPORT',
      resource: String(resource),
      recordCount: Number.isFinite(n) ? n : null,
    })
    res.status(204).end()
  } catch (err) { next(err) }
}

// Admin: denetim kayıtlarını listele (filtreli, sayfalı)
export async function listAuditLogs(req, res, next) {
  try {
    const { action, resource, userId, dateFrom, dateTo } = req.query
    const where = {}
    if (action) where.action = String(action)
    if (resource) where.resource = String(resource)
    if (userId) where.userId = Number(userId)
    if (dateFrom || dateTo) {
      where.createdAt = {}
      if (dateFrom) where.createdAt.gte = startOfLocalDay(dateFrom)
      if (dateTo) where.createdAt.lte = endOfLocalDay(dateTo)
    }
    // Eskiden sabit take:200 vardı — 201. kayıt görünmüyordu, "eski log yok"
    // sanılıyordu. Artık sayfalanıyor.
    const pg = parsePagination(req)
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pg.skip,
        take: pg.limit,
      }),
      prisma.auditLog.count({ where }),
    ])
    res.json(paginated(logs, total, pg))
  } catch (err) { next(err) }
}
