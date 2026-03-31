import rateLimit from 'express-rate-limit'

// General API limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})

// Stricter limiter for AI endpoints — protects against surprise bills
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI rate limit reached. Max 20 scoring requests per hour.' },
  keyGenerator: (req) => {
    // Rate limit per user (from auth header) rather than IP
    return req.headers['x-user-id'] as string || req.ip || 'unknown'
  },
})
