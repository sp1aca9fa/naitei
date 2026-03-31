import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { apiLimiter } from './middleware/rateLimiter'
import healthRouter from './routes/health'
import profileRouter from './routes/profile'

const app = express()
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
app.use(apiLimiter)

app.use('/health', healthRouter)
app.use('/profile', profileRouter)

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
})

export default app
