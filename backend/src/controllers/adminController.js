import { prisma } from '../utils/prismaClient.js'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'

const BCRYPT_ROUNDS = 10

// --- AUTH ---
export async function login(req, res, next) {
  try {
    const { username, password } = req.body
    if (!username || !password) {
      return res.status(400).json({ error: 'Kullanıcı adı ve şifre zorunludur' })
    }

    const user = await prisma.user.findUnique({ where: { username } })
    if (!user || !user.passwordHash || !user.active) {
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' })
    }

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' })
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, roles: user.roles, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN ?? '8h' }
    )
    res.json({ token, user: { id: user.id, name: user.name, username: user.username, roles: user.roles } })
  } catch (err) {
    next(err)
  }
}

export async function me(req, res) {
  res.json({ id: req.user.id, username: req.user.username, roles: req.user.roles, name: req.user.name })
}

// --- FIELD WHITELISTS (mass-assignment protection) ---
const ALLOWED_FIELDS = {
  driver:   ['name'],
  producer: ['name', 'driverId', 'active'],
  product:  ['name', 'icon'],
  quality:  ['name'],
  market:   ['no', 'name'],
  user:     ['name', 'username', 'roles', 'active'],
}

const VALID_ROLES = ['ADMIN', 'DEPO', 'OPERATOR', 'ACCOUNTING', 'CASE_MANAGER']
function normalizeRoles(input) {
  if (!Array.isArray(input)) return null
  const cleaned = [...new Set(input.map(String).map((r) => r.toUpperCase()))].filter((r) => VALID_ROLES.includes(r))
  return cleaned.length ? cleaned : null
}

function pick(obj, fields) {
  return Object.fromEntries(fields.filter((f) => f in obj).map((f) => [f, obj[f]]))
}

// --- GENERIC CRUD FACTORY ---
function crudFor(model, orderBy = { id: 'asc' }) {
  const fields = ALLOWED_FIELDS[model] ?? []
  return {
    async getAll(req, res, next) {
      try {
        const records = await prisma[model].findMany({ orderBy })
        res.json(records)
      } catch (err) { next(err) }
    },
    async create(req, res, next) {
      try {
        const data = pick(req.body, fields)
        const record = await prisma[model].create({ data })
        res.status(201).json(record)
      } catch (err) { next(err) }
    },
    async update(req, res, next) {
      try {
        const data = pick(req.body, fields)
        const record = await prisma[model].update({
          where: { id: Number(req.params.id) },
          data,
        })
        res.json(record)
      } catch (err) { next(err) }
    },
    async remove(req, res, next) {
      try {
        await prisma[model].delete({ where: { id: Number(req.params.id) } })
        res.status(204).end()
      } catch (err) { next(err) }
    },
  }
}

export const driverCrud = crudFor('driver', { name: 'asc' })
export const producerCrud = crudFor('producer', { name: 'asc' })
export const productCrud = crudFor('product', { name: 'asc' })
export const qualityCrud = crudFor('quality', { name: 'asc' })
export const marketCrud = crudFor('market', { no: 'asc' })

// --- USER CRUD (password hashing + select projection) ---
const USER_SAFE = { id: true, name: true, username: true, roles: true, active: true, createdAt: true }

export const userCrud = {
  async getAll(req, res, next) {
    try {
      const users = await prisma.user.findMany({ orderBy: { name: 'asc' }, select: USER_SAFE })
      res.json(users)
    } catch (err) { next(err) }
  },
  async create(req, res, next) {
    try {
      const data = pick(req.body, ALLOWED_FIELDS.user)
      const { password } = req.body
      if (data.roles !== undefined) {
        const roles = normalizeRoles(data.roles)
        if (!roles) return res.status(400).json({ error: 'En az bir geçerli rol seçilmeli' })
        data.roles = roles
      }
      if (data.username && !password) {
        return res.status(400).json({ error: 'Kullanıcı adı belirlendiyse şifre zorunlu' })
      }
      if (password) data.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
      const user = await prisma.user.create({ data, select: USER_SAFE })
      res.status(201).json(user)
    } catch (err) {
      if (err.code === 'P2002') return res.status(409).json({ error: 'Bu kullanıcı adı zaten kullanılıyor' })
      next(err)
    }
  },
  async update(req, res, next) {
    try {
      const data = pick(req.body, ALLOWED_FIELDS.user)
      const { password } = req.body
      if (data.roles !== undefined) {
        const roles = normalizeRoles(data.roles)
        if (!roles) return res.status(400).json({ error: 'En az bir geçerli rol seçilmeli' })
        data.roles = roles
      }
      if (password) data.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
      const user = await prisma.user.update({
        where: { id: Number(req.params.id) },
        data,
        select: USER_SAFE,
      })
      res.json(user)
    } catch (err) {
      if (err.code === 'P2002') return res.status(409).json({ error: 'Bu kullanıcı adı zaten kullanılıyor' })
      next(err)
    }
  },
  async remove(req, res, next) {
    try {
      await prisma.user.delete({ where: { id: Number(req.params.id) } })
      res.status(204).end()
    } catch (err) { next(err) }
  },
}
