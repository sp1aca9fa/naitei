import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { apiLimiter } from './middleware/rateLimiter'
import healthRouter from './routes/health'
import profileRouter from './routes/profile'
import companyRouter from './routes/company'
import jobsRouter from './routes/jobs'
import applicationsRouter from './routes/applications'
import cronRouter, { runDailyDigest } from './routes/cron'
import insightsRouter from './routes/insights'

const app = express()
app.set('trust proxy', 1)
const PORT = process.env.PORT || 3001

const allowedOrigin = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true)
    if (origin === allowedOrigin) return callback(null, true)
    console.error(`CORS blocked: origin="${origin}" allowedOrigin="${allowedOrigin}"`)
    callback(new Error(`CORS: origin not allowed`))
  },
  credentials: true,
}

app.use(cors(corsOptions))
app.options('*', cors(corsOptions))

app.use(express.json())

// Cron routes — registered before apiLimiter, auth handled internally via CRON_SECRET
app.use('/cron', cronRouter)

app.use(apiLimiter)

app.use('/health', healthRouter)
app.use('/profile', profileRouter)
app.use('/company', companyRouter)
app.use('/jobs', jobsRouter)
app.use('/applications', applicationsRouter)
app.use('/insights', insightsRouter)

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
  // Send any missed daily digests (skips users whose digest was sent in the last 24h)
  runDailyDigest().catch(err => console.error('[startup] digest check failed:', err))
})

export default app
