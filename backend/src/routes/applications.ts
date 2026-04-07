import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { aiLimiter } from '../middleware/rateLimiter'
import { getCompanyAIProvider } from '../services/ai/provider'
import { InterviewPrepSchema, CoverLetterSchema, ApplyChecklistSchema, ResumeOptimizationSchema } from '../services/ai/schemas'
import { parseAIJson } from '../services/ai/parseJson'
import { INTERVIEW_PREP_SYSTEM, interviewPrepPrompt } from '../prompts/interview-prep'
import { COVER_LETTER_SYSTEM, coverLetterPrompt } from '../prompts/cover-letter'
import { APPLY_CHECKLIST_SYSTEM, applyChecklistPrompt } from '../prompts/apply-checklist'
import { RESUME_OPTIMIZATION_SYSTEM, resumeOptimizationPrompt } from '../prompts/resume-optimization'
import { supabase } from '../lib/supabase'

const router = Router()

const SaveApplicationSchema = z.object({
  job_id: z.string().uuid(),
  status: z.enum(['saved', 'applied', 'interview', 'offer', 'removed']).default('saved'),
})

// POST /applications — save a job to the pipeline
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const parsed = SaveApplicationSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { data: job } = await supabase
    .from('jobs')
    .select('id')
    .eq('id', parsed.data.job_id)
    .eq('user_id', req.user!.id)
    .single()

  if (!job) return res.status(404).json({ error: 'Job not found' })

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
    .select('id, status, created_at, updated_at, applied_at, follow_up_date, interview_round, recruiter_name, notes, cover_letter, cover_letter_generated_at, interview_prep, interview_prep_generated_at, apply_checklist, apply_checklist_generated_at, resume_optimization, resume_optimization_generated_at, offer_monthly_salary, offer_annual_salary, offer_bonus_type, offer_bonus_amount, offer_bonus_times, offer_notes, job_id, jobs(id, title, company, ai_score, ai_recommendation, ats_score, source)')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// GET /applications/:id — single application with full data
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('applications')
    .select('id, status, interview_round, interview_prep, interview_prep_generated_at, resume_optimization, resume_optimization_generated_at, job_id, jobs(id, title, company)')
    .eq('id', req.params.id)
    .eq('user_id', req.user!.id)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Not found' })
  return res.json(data)
})

const UpdateApplicationSchema = z.object({
  status: z.enum(['saved', 'applied', 'interview', 'offer', 'removed']).optional(),
  applied_at: z.string().datetime({ offset: true }).nullable().optional(),
  follow_up_date: z.string().datetime({ offset: true }).nullable().optional(),
  interview_round: z.number().int().min(1).max(20).optional(),
  recruiter_name: z.string().max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  offer_monthly_salary: z.number().int().min(0).nullable().optional(),
  offer_annual_salary: z.number().int().min(0).nullable().optional(),
  offer_bonus_type: z.enum(['1_salary', '2_salary', '3_salary', 'manual']).nullable().optional(),
  offer_bonus_amount: z.number().int().min(0).nullable().optional(),
  offer_bonus_times: z.number().int().min(1).max(12).nullable().optional(),
  offer_notes: z.string().max(5000).nullable().optional(),
  cover_letter: z.string().max(10000).nullable().optional(),
})

// PATCH /applications/:id — update status and/or other fields
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const parsed = UpdateApplicationSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const updates: Record<string, unknown> = { ...parsed.data }

  // Auto-set applied_at when moving to 'applied' if not provided
  if (parsed.data.status === 'applied' && !('applied_at' in parsed.data)) {
    const { data: current } = await supabase
      .from('applications')
      .select('applied_at')
      .eq('id', req.params.id)
      .eq('user_id', req.user!.id)
      .single()
    if (current && !current.applied_at) {
      updates.applied_at = new Date().toISOString()
    }
  }

  const { data, error } = await supabase
    .from('applications')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', req.user!.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Not found' })
  return res.json(data)
})

const AI_DELAY_HOURS = () => parseFloat(process.env.AI_REQUEST_DELAY_HOURS ?? process.env.RESCORE_DELAY_HOURS ?? '24')

function checkAIDelay(generatedAt: string | null): { blocked: boolean; available_at?: string } {
  const delayHours = AI_DELAY_HOURS()
  if (!generatedAt || delayHours <= 0) return { blocked: false }
  const availableAt = new Date(new Date(generatedAt).getTime() + delayHours * 3600 * 1000)
  if (availableAt > new Date()) return { blocked: true, available_at: availableAt.toISOString() }
  return { blocked: false }
}

// POST /applications/:id/interview-prep — generate interview prep (auto on first Interview entry, manual regenerate)
router.post('/:id/interview-prep', requireAuth, aiLimiter, async (req: Request, res: Response) => {
  const force = req.query.force === 'true'

  const [{ data: app }, { data: profile }] = await Promise.all([
    supabase.from('applications')
      .select('id, interview_prep, interview_prep_generated_at, job_id, jobs(title, company, description_raw, matched_skills, missing_skills, ai_green_flags, ai_red_flags, ai_summary, ai_recommendation_reason)')
      .eq('id', req.params.id).eq('user_id', req.user!.id).single(),
    supabase.from('profiles')
      .select('experience_summary, skills')
      .eq('user_id', req.user!.id).single(),
  ])

  if (!app) return res.status(404).json({ error: 'Application not found' })

  // Return cached if exists and not forcing
  if (!force && app.interview_prep) return res.json(app.interview_prep)

  // Enforce delay on regenerate (force=true means user manually requested)
  if (force) {
    const delay = checkAIDelay((app as Record<string, unknown>).interview_prep_generated_at as string | null)
    if (delay.blocked) return res.status(429).json({ error: 'Regenerate not available yet.', available_at: delay.available_at })
  }

  const job = app.jobs as Record<string, unknown> | null
  if (!job) return res.status(400).json({ error: 'Job data missing' })
  if (!profile?.experience_summary) return res.status(400).json({ error: 'Profile experience summary missing' })

  const ai = getCompanyAIProvider()
  let raw: string
  try {
    raw = await ai.complete(INTERVIEW_PREP_SYSTEM, interviewPrepPrompt({
      jobTitle: job.title as string,
      company: (job.company as string) ?? '',
      descriptionExcerpt: ((job.description_raw as string) ?? '').slice(0, 1000),
      matchedSkills: (job.matched_skills as string[]) ?? [],
      missingSkills: (job.missing_skills as string[]) ?? [],
      greenFlags: (job.ai_green_flags as string[]) ?? [],
      redFlags: (job.ai_red_flags as string[]) ?? [],
      recommendationReason: (job.ai_recommendation_reason as string) ?? '',
      experienceSummary: profile.experience_summary,
      skills: profile.skills ?? [],
    }))
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : 'AI call failed' })
  }

  let parsed: unknown
  try { parsed = parseAIJson(raw) } catch {
    return res.status(502).json({ error: 'AI returned invalid JSON' })
  }

  const validation = InterviewPrepSchema.safeParse(parsed)
  if (!validation.success) {
    console.error('[interview-prep] Validation failed.\nRaw:', raw, '\nErrors:', JSON.stringify(validation.error.flatten(), null, 2))
    return res.status(502).json({ error: 'AI response failed validation', details: validation.error.flatten() })
  }

  const now = new Date().toISOString()
  await supabase.from('applications').update({ interview_prep: validation.data, interview_prep_generated_at: now }).eq('id', req.params.id).eq('user_id', req.user!.id)
  return res.json(validation.data)
})

// POST /applications/:id/cover-letter — generate cover letter
router.post('/:id/cover-letter', requireAuth, aiLimiter, async (req: Request, res: Response) => {
  const force = req.query.force === 'true'

  const [{ data: app }, { data: profile }] = await Promise.all([
    supabase.from('applications')
      .select('id, cover_letter, cover_letter_generated_at, job_id, jobs(title, company, description_raw, matched_skills, missing_skills, ai_summary)')
      .eq('id', req.params.id).eq('user_id', req.user!.id).single(),
    supabase.from('profiles')
      .select('experience_summary, skills')
      .eq('user_id', req.user!.id).single(),
  ])

  if (!app) return res.status(404).json({ error: 'Application not found' })
  if (!force && app.cover_letter) return res.json({ cover_letter: app.cover_letter })

  if (force) {
    const delay = checkAIDelay((app as Record<string, unknown>).cover_letter_generated_at as string | null)
    if (delay.blocked) return res.status(429).json({ error: 'Regenerate not available yet.', available_at: delay.available_at })
  }

  const job = app.jobs as Record<string, unknown> | null
  if (!job) return res.status(400).json({ error: 'Job data missing' })
  if (!profile?.experience_summary) return res.status(400).json({ error: 'Profile experience summary missing' })

  const ai = getCompanyAIProvider()
  let raw: string
  try {
    raw = await ai.complete(COVER_LETTER_SYSTEM, coverLetterPrompt({
      jobTitle: job.title as string,
      company: job.company as string ?? '',
      descriptionExcerpt: ((job.description_raw as string) ?? '').slice(0, 800),
      matchedSkills: (job.matched_skills as string[]) ?? [],
      missingSkills: (job.missing_skills as string[]) ?? [],
      aiSummary: (job.ai_summary as string) ?? '',
      experienceSummary: profile.experience_summary,
      skills: profile.skills ?? [],
    }))
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : 'AI call failed' })
  }

  let parsed: unknown
  try { parsed = parseAIJson(raw) } catch {
    return res.status(502).json({ error: 'AI returned invalid JSON' })
  }

  const validation = CoverLetterSchema.safeParse(parsed)
  if (!validation.success) return res.status(502).json({ error: 'AI response failed validation' })

  const now = new Date().toISOString()
  await supabase.from('applications').update({ cover_letter: validation.data.text, cover_letter_generated_at: now }).eq('id', req.params.id).eq('user_id', req.user!.id)
  return res.json({ cover_letter: validation.data.text, cover_letter_generated_at: now })
})

// POST /applications/:id/apply-checklist — generate quick apply checklist
router.post('/:id/apply-checklist', requireAuth, aiLimiter, async (req: Request, res: Response) => {
  const force = req.query.force === 'true'

  const [{ data: app }, { data: profile }] = await Promise.all([
    supabase.from('applications')
      .select('id, apply_checklist, apply_checklist_generated_at, job_id, jobs(title, company, description_raw, matched_skills, missing_skills, ai_green_flags, ai_red_flags, ai_recommendation, ai_recommendation_reason)')
      .eq('id', req.params.id).eq('user_id', req.user!.id).single(),
    supabase.from('profiles')
      .select('raw_resume_text, resume_versions, active_resume_version_id')
      .eq('user_id', req.user!.id).single(),
  ])

  if (!app) return res.status(404).json({ error: 'Application not found' })
  if (!force && app.apply_checklist) return res.json(app.apply_checklist)

  if (force) {
    const delay = checkAIDelay((app as Record<string, unknown>).apply_checklist_generated_at as string | null)
    if (delay.blocked) return res.status(429).json({ error: 'Regenerate not available yet.', available_at: delay.available_at })
  }

  const job = app.jobs as Record<string, unknown> | null
  if (!job) return res.status(400).json({ error: 'Job data missing' })

  // Prefer the active resume version's text, fall back to raw_resume_text
  const versions = Array.isArray(profile?.resume_versions) ? profile.resume_versions as { id: string; text: string }[] : []
  const activeVersion = versions.find(v => v.id === profile?.active_resume_version_id)
  const resumeText = activeVersion?.text ?? profile?.raw_resume_text ?? null
  if (!resumeText) return res.status(400).json({ error: 'No resume uploaded' })

  const ai = getCompanyAIProvider()
  let raw: string
  try {
    raw = await ai.complete(APPLY_CHECKLIST_SYSTEM, applyChecklistPrompt({
      jobTitle: job.title as string,
      company: (job.company as string) ?? '',
      descriptionExcerpt: ((job.description_raw as string) ?? '').slice(0, 800),
      matchedSkills: (job.matched_skills as string[]) ?? [],
      missingSkills: (job.missing_skills as string[]) ?? [],
      greenFlags: (job.ai_green_flags as string[]) ?? [],
      redFlags: (job.ai_red_flags as string[]) ?? [],
      recommendation: (job.ai_recommendation as string) ?? '',
      recommendationReason: (job.ai_recommendation_reason as string) ?? '',
      resumeText: resumeText.slice(0, 3000),
    }))
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : 'AI call failed' })
  }

  let parsed: unknown
  try { parsed = parseAIJson(raw) } catch {
    return res.status(502).json({ error: 'AI returned invalid JSON' })
  }

  const validation = ApplyChecklistSchema.safeParse(parsed)
  if (!validation.success) {
    console.error('[apply-checklist] Validation failed.\nRaw:', raw, '\nErrors:', JSON.stringify(validation.error.flatten(), null, 2))
    return res.status(502).json({ error: 'AI response failed validation', details: validation.error.flatten() })
  }

  const now = new Date().toISOString()
  await supabase.from('applications').update({ apply_checklist: validation.data, apply_checklist_generated_at: now }).eq('id', req.params.id).eq('user_id', req.user!.id)
  return res.json(validation.data)
})

// POST /applications/:id/resume-optimization — full CV audit against the job
router.post('/:id/resume-optimization', requireAuth, aiLimiter, async (req: Request, res: Response) => {
  const force = req.query.force === 'true'

  const [{ data: app }, { data: profile }] = await Promise.all([
    supabase.from('applications')
      .select('id, resume_optimization, resume_optimization_generated_at, job_id, jobs(title, company, description_raw, matched_skills, missing_skills, ai_recommendation, ai_recommendation_reason)')
      .eq('id', req.params.id).eq('user_id', req.user!.id).single(),
    supabase.from('profiles')
      .select('raw_resume_text, resume_versions, active_resume_version_id')
      .eq('user_id', req.user!.id).single(),
  ])

  if (!app) return res.status(404).json({ error: 'Application not found' })
  if (!force && app.resume_optimization) return res.json(app.resume_optimization)

  if (force) {
    const delay = checkAIDelay((app as Record<string, unknown>).resume_optimization_generated_at as string | null)
    if (delay.blocked) return res.status(429).json({ error: 'Regenerate not available yet.', available_at: delay.available_at })
  }

  const job = app.jobs as Record<string, unknown> | null
  if (!job) return res.status(400).json({ error: 'Job data missing' })

  const versions = Array.isArray(profile?.resume_versions) ? profile.resume_versions as { id: string; text: string }[] : []
  const activeVersion = versions.find(v => v.id === profile?.active_resume_version_id)
  const resumeText = activeVersion?.text ?? profile?.raw_resume_text ?? null
  if (!resumeText) return res.status(400).json({ error: 'No resume uploaded' })

  const ai = getCompanyAIProvider()
  let raw: string
  try {
    raw = await ai.complete(RESUME_OPTIMIZATION_SYSTEM, resumeOptimizationPrompt({
      jobTitle: job.title as string,
      company: (job.company as string) ?? '',
      jobDescription: (job.description_raw as string) ?? '',
      matchedSkills: (job.matched_skills as string[]) ?? [],
      missingSkills: (job.missing_skills as string[]) ?? [],
      recommendation: (job.ai_recommendation as string) ?? '',
      recommendationReason: (job.ai_recommendation_reason as string) ?? '',
      resumeText,
    }))
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : 'AI call failed' })
  }

  let parsed: unknown
  try { parsed = parseAIJson(raw) } catch {
    return res.status(502).json({ error: 'AI returned invalid JSON' })
  }

  const validation = ResumeOptimizationSchema.safeParse(parsed)
  if (!validation.success) {
    console.error('[resume-optimization] Validation failed.\nRaw:', raw, '\nErrors:', JSON.stringify(validation.error.flatten(), null, 2))
    return res.status(502).json({ error: 'AI response failed validation', details: validation.error.flatten() })
  }

  const now = new Date().toISOString()
  await supabase.from('applications').update({ resume_optimization: validation.data, resume_optimization_generated_at: now }).eq('id', req.params.id).eq('user_id', req.user!.id)
  return res.json(validation.data)
})

export default router
