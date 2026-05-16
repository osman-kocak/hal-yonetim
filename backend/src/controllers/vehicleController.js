import { prisma } from '../utils/prismaClient.js'

export async function startVehicle(req, res, next) {
  try {
    const { driverId } = req.body
    if (!driverId) {
      return res.status(400).json({ error: 'Şoför seçimi zorunludur' })
    }

    const existing = await prisma.vehicleSession.findFirst({
      where: { driverId: Number(driverId), status: 'ACTIVE' },
      include: { driver: true },
    })

    if (existing) {
      return res.json(existing)
    }

    const session = await prisma.vehicleSession.create({
      data: { driverId: Number(driverId) },
      include: { driver: true },
    })

    res.status(201).json(session)
  } catch (err) {
    next(err)
  }
}

// Belirli session'ın entry'lerini döndürür (operatör son girişlerini görsün diye)
export async function listSessionEntries(req, res, next) {
  try {
    const sessionId = Number(req.params.id)
    if (!sessionId) return res.status(400).json({ error: 'Geçersiz oturum' })

    const entries = await prisma.entry.findMany({
      where: { vehicleSessionId: sessionId },
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

export async function completeVehicle(req, res, next) {
  try {
    const { vehicleSessionId, clearBalance } = req.body
    if (!vehicleSessionId) {
      return res.status(400).json({ error: 'Araç oturumu zorunludur' })
    }

    const existing = await prisma.vehicleSession.findUnique({
      where: { id: Number(vehicleSessionId) },
      include: { driver: true },
    })
    if (!existing) {
      return res.status(404).json({ error: 'Oturum bulunamadı' })
    }
    if (existing.status === 'COMPLETED') {
      return res.json(existing)
    }

    const createdBy = req.user?.name || req.user?.username || 'Sistem'

    const session = await prisma.$transaction(async (tx) => {
      const completed = await tx.vehicleSession.update({
        where: { id: Number(vehicleSessionId) },
        data: { status: 'COMPLETED' },
        include: { driver: true },
      })

      // İstenirse şoför bakiyesini sıfırla (kalan kasa sayısı kadar pozitif DRIVER_ADJUST)
      if (clearBalance) {
        // Anlık bakiyeyi hesapla: tüm hareketlerden signed toplam
        const groups = await tx.caseMovement.groupBy({
          by: ['type'],
          where: { driverId: completed.driverId },
          _sum: { qty: true },
        })
        let balance = 0
        for (const g of groups) {
          const v = g._sum.qty ?? 0
          if (g.type === 'DRIVER_OUT' || g.type === 'DRIVER_INIT' || g.type === 'DRIVER_ADJUST') balance += v
          else if (g.type === 'DRIVER_IN') balance -= v
        }
        // Bakiye negatif ise (şoför fazla kasayı işletmeye verdi) pozitif ADJUST ile sıfırla.
        // Pozitif ise (şoförde hala kasa var) negatif ADJUST ile sıfırla.
        if (balance !== 0) {
          await tx.caseMovement.create({
            data: {
              type: 'DRIVER_ADJUST',
              qty: -balance, // signed; bu hareket DRIVER_ADJUST sign +1 ile çarpılır → bakiyeyi -balance kadar değiştirir
              driverId: completed.driverId,
              note: `Araç bitti, bakiye sıfırlandı (önceki: ${balance})`,
              createdBy,
            },
          })
        }
      }
      return completed
    })

    res.json(session)
  } catch (err) {
    next(err)
  }
}
