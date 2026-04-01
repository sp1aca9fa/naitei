import { Router, Request, Response } from 'express'
import { z } from 'zod'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { requireAuth } from '../middleware/auth'
import { aiLimiter } from '../middleware/rateLimiter'
import { supabase } from '../lib/supabase'
import { scoreJob } from '../services/scoreJob'
import { scrapeJobUrl } from '../services/scrapeJobUrl'

interface RemotiveJob {
  id: number
  url: string
  title: string
  company_name: string
  description: string
  publication_date: string
  salary: string
  job_type: string
  candidate_required_location: string
}

const router = Router()

const PasteImportSchema = z.object({
  description: z.string().min(50, 'Job description must be at least 50 characters'),
  title: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  url: z.string().url().optional(),
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

  const { description, title: titleInput, company: companyInput, url: urlInput } = parsed.data

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
      url: urlInput ?? null,
      source: urlInput ? 'url_fetch' : 'paste',
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

// POST /jobs/import/remotive — fetch software-dev jobs from Remotive, deduplicate, score new ones
router.post('/import/remotive', requireAuth, aiLimiter, async (req: Request, res: Response) => {
  let remotiveJobs: RemotiveJob[]
  try {
    const response = await axios.get('https://remotive.com/api/remote-jobs?category=software-dev', {
      timeout: 15000,
    })
    remotiveJobs = response.data.jobs ?? []
  } catch {
    return res.status(502).json({ error: 'Failed to fetch from Remotive' })
  }

  // Get existing URLs for this user to deduplicate
  const { data: existingRows } = await supabase
    .from('jobs')
    .select('url')
    .eq('user_id', req.user!.id)
    .not('url', 'is', null)

  const existingUrls = new Set((existingRows ?? []).map((j: { url: string }) => j.url))

  // Filter new, cap at 20 most recent
  const now = Date.now()
  const newJobs = remotiveJobs
    .filter(j => j.url && !existingUrls.has(j.url))
    .slice(0, 20)

  if (newJobs.length === 0) {
    return res.json({ imported: 0, skipped: remotiveJobs.length - newJobs.length, total: remotiveJobs.length })
  }

  let imported = 0
  let failed = 0

  for (const rj of newJobs) {
    const description = rj.description
      ? cheerio.load(rj.description).text().replace(/\s+/g, ' ').trim().slice(0, 8000)
      : ''
    if (description.length < 50) { failed++; continue }

    const postedAt = rj.publication_date ? new Date(rj.publication_date) : null
    const isRecent = postedAt ? (now - postedAt.getTime()) < 24 * 60 * 60 * 1000 : false

    const { data: job, error: insertError } = await supabase
      .from('jobs')
      .insert({
        user_id: req.user!.id,
        title: (rj.title ?? 'Remote Job').slice(0, 200),
        company: rj.company_name?.slice(0, 200) ?? null,
        description_raw: description,
        url: rj.url,
        source: 'remotive',
        posted_at: postedAt?.toISOString() ?? null,
        is_recent: isRecent,
        scoring_status: 'pending',
      })
      .select()
      .single()

    if (insertError || !job) { failed++; continue }

    try {
      await scoreJob(job.id, req.user!.id)
      imported++
    } catch {
      failed++
    }
  }

  return res.json({ imported, failed, skipped: remotiveJobs.length - newJobs.length, total: remotiveJobs.length })
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

// PATCH /jobs/:id — update mutable fields (currently: url)
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const { url } = req.body
  if (url !== undefined && (typeof url !== 'string' || !url)) {
    return res.status(400).json({ error: 'url must be a non-empty string' })
  }

  const { data, error } = await supabase
    .from('jobs')
    .update({ url })
    .eq('id', req.params.id)
    .eq('user_id', req.user!.id)
    .select()
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
