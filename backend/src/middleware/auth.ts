import type { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

// Verify Supabase JWT from Authorization header
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' })
    return
  }

  const token = authHeader.slice(7)

  // Use anon key + user token to verify — this respects RLS
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  )

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  req.user = user
  res.setHeader('x-user-id', user.id)
  next()
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: import('@supabase/supabase-js').User
    }
  }
}
