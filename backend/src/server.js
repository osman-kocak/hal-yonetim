import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { prisma } from './utils/prismaClient.js'
import apiRouter from './routes/index.js'
import { errorHandler } from './middleware/errorHandler.js'

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET ortam değişkeni tanımlanmamış')
  process.exit(1)
}

const app = express()
const PORT = process.env.PORT ?? 3001

const allowedOrigin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173'
app.use(cors({ origin: allowedOrigin }))
app.use(express.json())

app.use('/api', apiRouter)

app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.use(errorHandler)

async function start() {
  await prisma.$connect()
  app.listen(PORT, () => {
    console.log(`Backend http://localhost:${PORT} üzerinde çalışıyor`)
  })
}

start().catch((err) => {
  console.error('Sunucu başlatılamadı:', err)
  process.exit(1)
})
