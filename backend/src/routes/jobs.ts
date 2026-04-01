import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { aiLimiter } from '../middleware/rateLimiter'
import { supabase } from '../lib/supabase'
import { scoreJob } from '../services/scoreJob'
import { scrapeJobUrl } from '../services/scrapeJobUrl'

const router = Router()

const PasteImportSchema = z.object({
  description: z.string().min(50, 'Job description must be at least 50 characters'),
  title: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
})

// POST /jobs/import/url — scrape a job URL, fall back if it fails
router.post('/import/url', requireAuth, async (req: Request, res: Response) => {
  const { url } = req.body
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url required' })

  try {
    new URL(url) // validate
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }

  try {
    const scraped = await scrapeJobUrl(url)
    return res.json(scraped)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    return res.json({ fallback: true, reason: msg })
  }
})

// POST /jobs/import/paste — paste raw job description, score immediately
router.post('/import/paste', requireAuth, aiLimiter, async (req: Request, res: Response) => {
  const parsed = PasteImportSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { description, title: titleInput, company: companyInput } = parsed.data

  // Extract title from first non-empty line if not provided
  const lines = description.trim().split('\n').map(l => l.trim()).filter(Boolean)
  const title = titleInput ?? lines[0]?.slice(0, 200) ?? 'Pasted Job'
  const company = companyInput ?? null

  // Insert job row
  const { data: job, error: insertError } = await supabase
    .from('jobs')
    .insert({
      user_id: req.user!.id,
      title,
      company,
      description_raw: description,
      source: 'paste',
      scoring_status: 'pending',
    })
    .select()
    .single()

  if (insertError) return res.status(500).json({ error: insertError.message })

  // Score it
  try {
    const score = await scoreJob(job.id, req.user!.id)
    return res.json({ job: { ...job, scoring_status: 'scored' }, score })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Scoring failed'
    const code = (err as Error & { code?: string }).code
    return res.json({ job, error: msg, skipped: code === 'skipped' })
  }
})

// GET /jobs — list user's jobs, most recent first
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, title, company, source, scoring_status, ai_score, ai_recommendation, ats_score, is_recent, created_at')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// GET /jobs/:id — full job detail
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user!.id)
    .single()

  if (error || !data) return res.status(404).json({ error: 'Job not found' })
  return res.json(data)
})

// POST /jobs/:id/rescore
router.post('/:id/rescore', requireAuth, aiLimiter, async (req: Request, res: Response) => {
  // Verify job belongs to user
  const { data: job, error: fetchError } = await supabase
    .from('jobs')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', req.user!.id)
    .single()

  if (fetchError || !job) return res.status(404).json({ error: 'Job not found' })

  // Reset status
  await supabase.from('jobs').update({ scoring_status: 'pending' }).eq('id', req.params.id)

  try {
    const score = await scoreJob(req.params.id, req.user!.id)
    const { data: updated } = await supabase.from('jobs').select('*').eq('id', req.params.id).single()
    return res.json({ job: updated, score })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Scoring failed'
    const code = (err as Error & { code?: string }).code
    const { data: updated } = await supabase.from('jobs').select('*').eq('id', req.params.id).single()
    return res.json({ job: updated, error: msg, skipped: code === 'skipped' })
  }
})

// DELETE /jobs/:id
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const { error } = await supabase
    .from('jobs')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user!.id)

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
})

export default router
