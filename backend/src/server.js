import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { prisma } from './utils/prismaClient.js'
import apiRouter from './routes/index.js'
import { errorHandler } from './middleware/errorHandler.js'
import { assertNetworkPolicy } from './middleware/network.js'
import { purgeOldAuditLogs, AUDIT_RETENTION_DAYS } from './utils/audit.js'

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET ortam değişkeni tanımlanmamış')
  process.exit(1)
}

assertNetworkPolicy()

const app = express()
const PORT = process.env.PORT ?? 3001

// LiteSpeed 127.0.0.1'den proxy'liyor. Bu ayar olmadan req.ip HER kullanıcı için
// '127.0.0.1' döner → login rate limit'i tüm sistem için tek sayaca dönüşür
// (15 dakikada toplam 10 giriş). X-Forwarded-For'un ilk hop'una güven.
app.set('trust proxy', 1)

const allowedOrigin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173'
app.use(cors({ origin: allowedOrigin }))
app.use(express.json())

app.use('/api', apiRouter)

app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.use(errorHandler)

// Denetim kaydı saklama süresi. Ayrı bir cron altyapısı yok; tek süreç
// çalıştığı için uygulama içi zamanlayıcı yeterli.
//
// Açılışta bir kez + günde bir: sunucu her gece yeniden başlatılmıyor, sadece
// açılışta çalışsa uzun süre ayakta kalan süreçte temizlik hiç yapılmazdı.
// unref(): bu zamanlayıcı süreci hayatta TUTMAMALI, kapanışı geciktirmesin.
const AUDIT_PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000

function scheduleAuditPurge() {
  const run = () => purgeOldAuditLogs().catch((err) => {
    // Temizlik başarısız olursa sunucu ayakta kalmalı — bir sonraki turda yeniden denenir.
    console.error('[audit] temizlik başarısız:', err.message)
  })
  run()
  const timer = setInterval(run, AUDIT_PURGE_INTERVAL_MS)
  timer.unref?.()
  console.log(`[audit] denetim kaydı saklama süresi: ${AUDIT_RETENTION_DAYS} gün`)
}

async function start() {
  await prisma.$connect()
  scheduleAuditPurge()
  app.listen(PORT, () => {
    console.log(`Backend http://localhost:${PORT} üzerinde çalışıyor`)
  })
}

start().catch((err) => {
  console.error('Sunucu başlatılamadı:', err)
  process.exit(1)
})
