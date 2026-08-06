import { prisma } from '../utils/prismaClient.js'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { audit } from '../utils/audit.js'
import { networkAllows, NETWORK_DENIED_MESSAGE } from '../middleware/network.js'

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

    // Saha rolleri hal ağı dışından token bile alamasın (requireAuth zaten her
    // istekte kontrol ediyor; burada da kesmek kullanıcıya doğru hatayı verir).
    if (!networkAllows(user, req.ip)) {
      return res
        .status(403)
        .json({ error: NETWORK_DENIED_MESSAGE, code: 'NETWORK_RESTRICTED' })
    }

    // Token ömrü: JWT_EXPIRES_IN ayarlıysa o süre, ayarlı DEĞİLSE süresiz (ömürlük — relogin gerekmez)
    const signOpts = process.env.JWT_EXPIRES_IN
      ? { expiresIn: process.env.JWT_EXPIRES_IN }
      : {}
    const token = jwt.sign(
      { id: user.id, username: user.username, roles: user.roles, name: user.name },
      process.env.JWT_SECRET,
      signOpts
    )
    res.json({ token, user: { id: user.id, name: user.name, username: user.username, roles: user.roles } })
  } catch (err) {
    next(err)
  }
}

// JWT'deki roller token üretildiği andaki hâli. Admin sonradan rol değiştirirse
// kullanıcı yeniden giriş yapana kadar eski rolüyle gezer. Bu yüzden DB'den taze
// oku — aynı zamanda silinmiş/pasife alınmış hesabı da burada yakalarız.
export async function me(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, username: true, roles: true, active: true },
    })
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Hesap devre dışı, lütfen tekrar giriş yapın' })
    }
    res.json({ id: user.id, username: user.username, roles: user.roles, name: user.name })
  } catch (err) { next(err) }
}

// --- FIELD WHITELISTS (mass-assignment protection) ---
const ALLOWED_FIELDS = {
  region:   ['name', 'active'],
  producer: ['name', 'regionId', 'allRegions', 'active'],
  product:  ['name', 'icon', 'groupName'],
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
        // Üretici (tedarikçi) ve pazar (müşteri) listeleri rakip-değeri yüksek —
        // tam liste okumasını izle. Düşük değerli listeler (ürün/kalite) atlanır.
        if (model === 'producer' || model === 'market') {
          audit(req, { action: 'READ', resource: model, recordCount: records.length })
        }
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

export const regionCrud = crudFor('region', { name: 'asc' })
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
