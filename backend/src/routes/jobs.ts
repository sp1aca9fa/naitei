import { Router, Request, Response } from 'express'
import { z } from 'zod'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { requireAuth } from '../middleware/auth'
import { aiLimiter, importLimiter } from '../middleware/rateLimiter'
import { supabase } from '../lib/supabase'
import { scoreJob } from '../services/scoreJob'
import { scrapeJobUrl } from '../services/scrapeJobUrl'

interface AdzunaJob {
  id: string
  title: string
  company: { display_name: string }
  description: string
  redirect_url: string
  created: string
  salary_min?: number
  salary_max?: number
  location: { display_name: string }
}

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

interface RemoteOkJob {
  id: string
  url: string
  position: string
  company: string
  description: string
  date: string
  salary_min?: number
  salary_max?: number
  tags?: string[]
}

const router = Router()

const PasteImportSchema = z.object({
  description: z.string().min(50, 'Job description must be at least 50 characters'),
  title: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  url: z.string().url().optional(),
  posted_at: z.string().optional(),
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
  const { data: profileData } = await supabase.from('profiles').select('skills').eq('user_id', req.user!.id).single()
  if (!profileData?.skills?.length) return res.status(400).json({ error: 'Add your skills to your profile before analyzing jobs.' })

  const parsed = PasteImportSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { description, title: titleInput, company: companyInput, url: urlInput, posted_at: postedAtInput } = parsed.data

  // Extract title from first non-empty line if not provided
  const lines = description.trim().split('\n').map(l => l.trim()).filter(Boolean)
  const title = titleInput ?? lines[0]?.slice(0, 200) ?? 'Pasted Job'
  const company = companyInput ?? null

  const postedAt = postedAtInput ? new Date(postedAtInput) : null
  const isRecent = postedAt ? (Date.now() - postedAt.getTime()) < 24 * 60 * 60 * 1000 : false

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
      posted_at: postedAt?.toISOString() ?? null,
      is_recent: isRecent,
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
    if (code !== 'skipped') console.error('[POST /jobs/import/paste] scoring error:', msg)
    const clientMsg = /overload|high demand|temporary|capacity/i.test(msg) ? msg : 'Scoring failed'
    return res.json({ job, error: clientMsg, skipped: code === 'skipped' })
  }
})

// POST /jobs/import/remotive — fetch software-dev jobs from Remotive, deduplicate, score new ones
router.post('/import/remotive', requireAuth, importLimiter, async (req: Request, res: Response) => {
  const { data: profileData } = await supabase.from('profiles').select('skills').eq('user_id', req.user!.id).single()
  const userSkills: string[] = profileData?.skills ?? []
  if (userSkills.length === 0) return res.status(400).json({ error: 'Add your skills to your profile before importing jobs.' })

  let remotiveJobs: RemotiveJob[]
  try {
    const response = await axios.get('https://remotive.com/api/remote-jobs?category=software-dev', { timeout: 15000 })
    remotiveJobs = response.data.jobs ?? []
  } catch {
    return res.status(502).json({ error: 'Failed to fetch from Remotive' })
  }

  const { data: existingRows } = await supabase.from('jobs').select('url').eq('user_id', req.user!.id).not('url', 'is', null)
  const existingUrls = new Set((existingRows ?? []).map((j: { url: string }) => j.url))

  const now = Date.now()
  const trulyNew = remotiveJobs.filter(j => j.url && !existingUrls.has(j.url))
  const already_imported = remotiveJobs.length - trulyNew.length

  if (trulyNew.length === 0) return res.json({ imported: 0, failed: 0, filtered: 0, already_imported, remaining: 0, total: remotiveJobs.length })

  // Pre-filter all truly new jobs before batching so remaining reflects real availability
  let failed = 0
  const skillMatched: { rj: RemotiveJob; description: string; postedAt: Date | null; isRecent: boolean }[] = []
  const noSkillMatch: { rj: RemotiveJob; description: string; postedAt: Date | null; isRecent: boolean }[] = []
  const userId = req.user!.id

  for (const rj of trulyNew) {
    const description = rj.description
      ? cheerio.load(rj.description).text().replace(/\s+/g, ' ').trim().slice(0, 8000)
      : ''
    if (description.length < 50) { failed++; continue }
    const postedAt = rj.publication_date ? new Date(rj.publication_date) : null
    const isRecent = postedAt ? (now - postedAt.getTime()) < 24 * 60 * 60 * 1000 : false
    const descLower = description.toLowerCase()
    if (userSkills.some(s => descLower.includes(s.toLowerCase()))) {
      skillMatched.push({ rj, description, postedAt, isRecent })
    } else {
      noSkillMatch.push({ rj, description, postedAt, isRecent })
    }
  }

  // Insert no-match jobs as skipped so they're deduplicated on the next call
  if (noSkillMatch.length > 0) {
    await supabase.from('jobs').upsert(
      noSkillMatch.map(({ rj, description, postedAt, isRecent }) => ({
        user_id: userId,
        title: (rj.title ?? 'Remote Job').slice(0, 200),
        company: rj.company_name?.slice(0, 200) ?? null,
        description_raw: description,
        url: rj.url,
        source: 'remotive',
        posted_at: postedAt?.toISOString() ?? null,
        is_recent: isRecent,
        scoring_status: 'skipped',
      })),
      { onConflict: 'user_id,url', ignoreDuplicates: true }
    )
  }

  const toImport = skillMatched.slice(0, 20)
  const remaining = skillMatched.length - toImport.length
  const filtered = noSkillMatch.length

  let insertedCount = 0
  const jobIdsToScore: string[] = []

  for (const { rj, description, postedAt, isRecent } of toImport) {
    const { data: job, error: insertError } = await supabase.from('jobs').insert({
      user_id: userId,
      title: (rj.title ?? 'Remote Job').slice(0, 200),
      company: rj.company_name?.slice(0, 200) ?? null,
      description_raw: description,
      url: rj.url,
      source: 'remotive',
      posted_at: postedAt?.toISOString() ?? null,
      is_recent: isRecent,
      scoring_status: 'pending',
    }).select().single()

    if (insertError || !job) { failed++; continue }
    jobIdsToScore.push(job.id)
    insertedCount++
  }

  // Respond immediately — scoring runs in the background after the response
  res.json({ imported: insertedCount, failed, filtered, already_imported, remaining, total: remotiveJobs.length })

  for (const jobId of jobIdsToScore) {
    try { await scoreJob(jobId, userId) } catch { /* already marked failed in scoreJob */ }
  }
})

// POST /jobs/import/adzuna — fetch Tokyo software jobs from Adzuna, deduplicate, score new ones
router.post('/import/adzuna', requireAuth, aiLimiter, async (req: Request, res: Response) => {
  const { data: profileData } = await supabase.from('profiles').select('skills').eq('user_id', req.user!.id).single()
  const userSkills: string[] = profileData?.skills ?? []
  if (userSkills.length === 0) return res.status(400).json({ error: 'Add your skills to your profile before importing jobs.' })

  const appId = process.env.ADZUNA_APP_ID
  const appKey = process.env.ADZUNA_APP_KEY
  if (!appId || !appKey) return res.status(500).json({ error: 'Adzuna credentials not configured' })

  let adzunaJobs: AdzunaJob[]
  try {
    const response = await axios.get(`https://api.adzuna.com/v1/api/jobs/jp/search/1`, {
      params: { app_id: appId, app_key: appKey, results_per_page: 50, what: 'software engineer developer', where: 'Tokyo' },
      timeout: 15000,
    })
    adzunaJobs = response.data.results ?? []
  } catch (err) {
    const detail = axios.isAxiosError(err) ? `${err.response?.status} ${JSON.stringify(err.response?.data)}` : String(err)
    console.error('Adzuna fetch error:', detail)
    return res.status(502).json({ error: 'Failed to fetch from Adzuna', detail })
  }

  const { data: existingRows } = await supabase.from('jobs').select('url').eq('user_id', req.user!.id).not('url', 'is', null)
  const existingUrls = new Set((existingRows ?? []).map((j: { url: string }) => j.url))

  const now = Date.now()
  const trulyNewAdzuna = adzunaJobs.filter(j => j.redirect_url && !existingUrls.has(j.redirect_url))
  const already_imported = adzunaJobs.length - trulyNewAdzuna.length
  const toImport = trulyNewAdzuna.slice(0, 20)
  const remaining = trulyNewAdzuna.length - toImport.length

  if (toImport.length === 0) return res.json({ imported: 0, filtered: 0, already_imported, remaining: 0, total: adzunaJobs.length })

  let imported = 0, failed = 0, filtered = 0

  for (const aj of toImport) {
    const description = aj.description?.replace(/\s+/g, ' ').trim().slice(0, 8000) ?? ''
    if (description.length < 50) { failed++; continue }

    const descLower = description.toLowerCase()
    if (!userSkills.some(s => descLower.includes(s.toLowerCase()))) { filtered++; continue }

    const postedAt = aj.created ? new Date(aj.created) : null
    const isRecent = postedAt ? (now - postedAt.getTime()) < 24 * 60 * 60 * 1000 : false

    const { data: job, error: insertError } = await supabase.from('jobs').insert({
      user_id: req.user!.id,
      title: (aj.title ?? 'Software Job').slice(0, 200),
      company: aj.company?.display_name?.slice(0, 200) ?? null,
      description_raw: description,
      url: aj.redirect_url,
      source: 'adzuna',
      location: aj.location?.display_name ?? null,
      salary_min: aj.salary_min ?? null,
      salary_max: aj.salary_max ?? null,
      posted_at: postedAt?.toISOString() ?? null,
      is_recent: isRecent,
      scoring_status: 'pending',
    }).select().single()

    if (insertError || !job) { failed++; continue }

    try {
      await scoreJob(job.id, req.user!.id)
      imported++
    } catch {
      failed++
    }
  }

  return res.json({ imported, failed, filtered, already_imported, remaining, total: adzunaJobs.length })
})

// POST /jobs/import/remoteok — fetch remote dev jobs from RemoteOK, deduplicate, score new ones
router.post('/import/remoteok', requireAuth, importLimiter, async (req: Request, res: Response) => {
  const { data: profileData } = await supabase.from('profiles').select('skills').eq('user_id', req.user!.id).single()
  const userSkills: string[] = profileData?.skills ?? []
  if (userSkills.length === 0) return res.status(400).json({ error: 'Add your skills to your profile before importing jobs.' })

  let rawJobs: RemoteOkJob[]
  try {
    const response = await axios.get('https://remoteok.com/api', {
      timeout: 15000,
      headers: { 'User-Agent': 'naitei-job-dashboard/1.0' },
    })
    rawJobs = (response.data as unknown[]).filter((j): j is RemoteOkJob => !!(j as RemoteOkJob).url && !!(j as RemoteOkJob).position)
  } catch {
    return res.status(502).json({ error: 'Failed to fetch from RemoteOK' })
  }

  const { data: existingRows } = await supabase.from('jobs').select('url').eq('user_id', req.user!.id).not('url', 'is', null)
  const existingUrls = new Set((existingRows ?? []).map((j: { url: string }) => j.url))

  const now = Date.now()
  const trulyNewRok = rawJobs.filter(j => j.url && !existingUrls.has(j.url))
  const already_imported = rawJobs.length - trulyNewRok.length

  if (trulyNewRok.length === 0) return res.json({ imported: 0, failed: 0, filtered: 0, already_imported, remaining: 0, total: rawJobs.length })

  // Pre-filter all truly new jobs before batching so remaining reflects real availability
  let failed = 0
  const skillMatched: { rj: RemoteOkJob; description: string; postedAt: Date | null; isRecent: boolean }[] = []
  const noSkillMatch: { rj: RemoteOkJob; description: string; postedAt: Date | null; isRecent: boolean }[] = []
  const userId = req.user!.id

  for (const rj of trulyNewRok) {
    const description = rj.description
      ? cheerio.load(rj.description).text().replace(/\s+/g, ' ').trim().slice(0, 8000)
      : ''
    if (description.length < 50) { failed++; continue }
    const postedAt = rj.date ? new Date(rj.date) : null
    const isRecent = postedAt ? (now - postedAt.getTime()) < 24 * 60 * 60 * 1000 : false
    const descLower = description.toLowerCase()
    if (userSkills.some(s => descLower.includes(s.toLowerCase()))) {
      skillMatched.push({ rj, description, postedAt, isRecent })
    } else {
      noSkillMatch.push({ rj, description, postedAt, isRecent })
    }
  }

  // Insert no-match jobs as skipped so they're deduplicated on the next call
  if (noSkillMatch.length > 0) {
    await supabase.from('jobs').upsert(
      noSkillMatch.map(({ rj, description, postedAt, isRecent }) => ({
        user_id: userId,
        title: (rj.position ?? 'Remote Job').slice(0, 200),
        company: rj.company?.slice(0, 200) ?? null,
        description_raw: description,
        url: rj.url,
        source: 'remoteok',
        posted_at: postedAt?.toISOString() ?? null,
        is_recent: isRecent,
        salary_min: rj.salary_min ?? null,
        salary_max: rj.salary_max ?? null,
        scoring_status: 'skipped',
      })),
      { onConflict: 'user_id,url', ignoreDuplicates: true }
    )
  }

  const toImport = skillMatched.slice(0, 20)
  const remaining = skillMatched.length - toImport.length
  const filtered = noSkillMatch.length

  let insertedCount = 0
  const jobIdsToScore: string[] = []

  for (const { rj, description, postedAt, isRecent } of toImport) {
    const { data: job, error: insertError } = await supabase.from('jobs').insert({
      user_id: userId,
      title: (rj.position ?? 'Remote Job').slice(0, 200),
      company: rj.company?.slice(0, 200) ?? null,
      description_raw: description,
      url: rj.url,
      source: 'remoteok',
      posted_at: postedAt?.toISOString() ?? null,
      is_recent: isRecent,
      salary_min: rj.salary_min ?? null,
      salary_max: rj.salary_max ?? null,
      scoring_status: 'pending',
    }).select().single()

    if (insertError || !job) { failed++; continue }
    jobIdsToScore.push(job.id)
    insertedCount++
  }

  // Respond immediately — scoring runs in the background after the response
  res.json({ imported: insertedCount, failed, filtered, already_imported, remaining, total: rawJobs.length })

  for (const jobId of jobIdsToScore) {
    try { await scoreJob(jobId, userId) } catch { /* already marked failed in scoreJob */ }
  }
})

// GET /jobs — list user's jobs, most recent first
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, title, company, source, scoring_status, ai_score, ai_recommendation, ats_score, is_recent, posted_at, scored_at, created_at, missing_skills')
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

// PATCH /jobs/:id — update mutable fields: url, posted_at
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const { url, posted_at } = req.body
  if (url !== undefined && (typeof url !== 'string' || !url)) {
    return res.status(400).json({ error: 'url must be a non-empty string' })
  }
  if (posted_at !== undefined && posted_at !== null && typeof posted_at !== 'string') {
    return res.status(400).json({ error: 'posted_at must be a date string or null' })
  }

  const updates: Record<string, unknown> = {}
  if (url !== undefined) updates.url = url
  if (posted_at !== undefined) {
    if (posted_at === null) {
      updates.posted_at = null
      updates.is_recent = false
    } else {
      const d = new Date(posted_at)
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid posted_at date' })
      updates.posted_at = d.toISOString()
      updates.is_recent = (Date.now() - d.getTime()) < 24 * 60 * 60 * 1000
    }
  }

  const { data, error } = await supabase
    .from('jobs')
    .update(updates)
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
    .select('id, scored_at, scoring_status')
    .eq('id', req.params.id)
    .eq('user_id', req.user!.id)
    .single()

  if (fetchError || !job) return res.status(404).json({ error: 'Job not found' })

  // Block rescore while already in progress
  if (job.scoring_status === 'pending') {
    return res.status(409).json({ error: 'Job is currently being scored. Wait for it to finish.' })
  }

  // Enforce rescore delay
  const delayHours = parseFloat(process.env.AI_REQUEST_DELAY_HOURS ?? process.env.RESCORE_DELAY_HOURS ?? '24')
  if (job.scored_at && delayHours > 0) {
    const availableAt = new Date(new Date(job.scored_at).getTime() + delayHours * 3600 * 1000)
    if (availableAt > new Date()) {
      return res.status(429).json({
        error: `Re-score not available yet. Available at ${availableAt.toISOString()}.`,
        available_at: availableAt.toISOString(),
      })
    }
  }

  // Reset status
  await supabase.from('jobs').update({ scoring_status: 'pending' }).eq('id', req.params.id)

  try {
    const score = await scoreJob(req.params.id, req.user!.id)
    const { data: updated } = await supabase.from('jobs').select('*').eq('id', req.params.id).single()
    return res.json({ job: updated, score })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Scoring failed'
    const code = (err as Error & { code?: string }).code
    console.error('[POST /jobs/:id/rescore] scoring error:', msg)
    const clientMsg = /overload|high demand|temporary|capacity/i.test(msg) ? msg : 'Scoring failed'
    const { data: updated } = await supabase.from('jobs').select('*').eq('id', req.params.id).single()
    return res.json({ job: updated, error: clientMsg, skipped: code === 'skipped' })
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
