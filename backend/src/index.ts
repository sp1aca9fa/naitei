import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { apiLimiter } from './middleware/rateLimiter'
import healthRouter from './routes/health'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))

app.use(express.json())
app.use(apiLimiter)

app.use('/health', healthRouter)

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
