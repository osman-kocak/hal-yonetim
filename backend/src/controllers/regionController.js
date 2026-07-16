import { prisma } from '../utils/prismaClient.js'

export async function startRegion(req, res, next) {
  try {
    const { regionId } = req.body
    if (!regionId) {
      return res.status(400).json({ error: 'Bölge seçimi zorunludur' })
    }

    // Açık oturum varsa onu döndür — operatör bölgeler arası gidip gelebiliyor,
    // "↩ Devam et" bu davranışa dayanıyor.
    const existing = await prisma.regionSession.findFirst({
      where: { regionId: Number(regionId), status: 'ACTIVE' },
      include: { region: true },
    })
    if (existing) return res.json(existing)

    const session = await prisma.regionSession.create({
      data: { regionId: Number(regionId) },
      include: { region: true },
    })
    res.status(201).json(session)
  } catch (err) {
    next(err)
  }
}

// Belirli oturumun entry'leri — "Son Girişler" listesi ve "Bölge Bitti" özeti kullanır
export async function listSessionEntries(req, res, next) {
  try {
    const sessionId = Number(req.params.id)
    if (!sessionId) return res.status(400).json({ error: 'Geçersiz oturum' })

    const entries = await prisma.entry.findMany({
      where: { regionSessionId: sessionId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: true,
        producer: true,
        quality: true,
        market: true,
        exitItems: { select: { id: true } },
      },
    })
    res.json(entries)
  } catch (err) { next(err) }
}

export async function completeRegion(req, res, next) {
  try {
    const { regionSessionId } = req.body
    if (!regionSessionId) {
      return res.status(400).json({ error: 'Bölge oturumu zorunludur' })
    }

    const existing = await prisma.regionSession.findUnique({
      where: { id: Number(regionSessionId) },
      include: { region: true },
    })
    if (!existing) {
      return res.status(404).json({ error: 'Oturum bulunamadı' })
    }
    if (existing.status === 'COMPLETED') {
      return res.json(existing)
    }

    const session = await prisma.regionSession.update({
      where: { id: Number(regionSessionId) },
      data: { status: 'COMPLETED' },
      include: { region: true },
    })
    res.json(session)
  } catch (err) {
    next(err)
  }
}
