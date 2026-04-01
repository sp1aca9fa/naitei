import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { supabase } from '../lib/supabase'

const router = Router()

const SaveApplicationSchema = z.object({
  job_id: z.string().uuid(),
  status: z.enum(['saved', 'applied', 'interview', 'offer', 'rejected']).default('saved'),
})

// POST /applications — save a job to the pipeline
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const parsed = SaveApplicationSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  // Verify job belongs to user
  const { data: job } = await supabase
    .from('jobs')
    .select('id')
    .eq('id', parsed.data.job_id)
    .eq('user_id', req.user!.id)
    .single()

  if (!job) return res.status(404).json({ error: 'Job not found' })

  // Upsert — re-saving an already-saved job just updates the status
  const { data, error } = await supabase
    .from('applications')
    .upsert(
      { user_id: req.user!.id, job_id: parsed.data.job_id, status: parsed.data.status },
      { onConflict: 'user_id,job_id' }
    )
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// GET /applications — list user's applications with job data
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('applications')
    .select('id, status, created_at, job_id, jobs(id, title, company, ai_score, ai_recommendation, ats_score, source)')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

export default router
