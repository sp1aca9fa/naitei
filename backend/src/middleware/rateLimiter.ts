import rateLimit from 'express-rate-limit'

const byUser = (req: { headers: { [key: string]: string | string[] | undefined }; ip?: string }) =>
  (req.headers['x-user-id'] as string) || req.ip || 'unknown'

// General API limiter — high enough that normal browsing never hits it; guards against scripts/bots
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  keyGenerator: byUser,
})

// Per-request AI limiter — for single-job scoring (paste, rescore)
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Scoring rate limit reached. Max 20 per hour. Try again later.' },
  keyGenerator: byUser,
})

// Bulk import limiter — separate from per-request AI limit so imports don't eat scoring quota
export const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Import rate limit reached. Max 10 imports per hour.' },
  keyGenerator: byUser,
})

// Company research limiter — generous since results are cached forever, just guards against burst abuse
export const companyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Company research rate limit reached. Try again later.' },
  keyGenerator: byUser,
})
