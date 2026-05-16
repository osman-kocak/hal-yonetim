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

export async function completeVehicle(req, res, next) {
  try {
    const { vehicleSessionId } = req.body
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

    const session = await prisma.vehicleSession.update({
      where: { id: Number(vehicleSessionId) },
      data: { status: 'COMPLETED' },
      include: { driver: true },
    })

    res.json(session)
  } catch (err) {
    next(err)
  }
}
