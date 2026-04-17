import { Router, Request, Response } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { tmpdir } from 'os'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { requireAuth } from '../middleware/auth'
import { aiLimiter } from '../middleware/rateLimiter'
import { getAIProvider } from '../services/ai/provider'
import { ParsedResumeSchema } from '../services/ai/schemas'
import { PARSE_RESUME_SYSTEM, parseResumePrompt } from '../prompts/parse-resume'
import { parseAIJson } from '../services/ai/parseJson'
import { supabase } from '../lib/supabase'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

// GET /profile
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', req.user!.id)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// PATCH /profile — update preferences, weights, blocklist
const UpdateProfileSchema = z.object({
  language: z.enum(['en', 'ja']).optional(),
  preferred_language_env: z.enum(['english', 'japanese', 'bilingual']).optional(),
  location_area: z.string().max(100).optional(),
  work_style: z.enum(['remote', 'hybrid', 'onsite', 'any']).optional(),
  score_weights: z.object({
    skills: z.number().int().min(0).max(100),
    language: z.number().int().min(0).max(100),
    company: z.number().int().min(0).max(100),
    location: z.number().int().min(0).max(100),
    growth: z.number().int().min(0).max(100),
  }).optional(),
  blocklist_words: z.array(z.string()).optional(),
  // resume corrections
  name: z.string().optional(),
  experience_years: z.number().int().optional(),
  experience_by_domain: z.array(z.object({ domain: z.string(), years: z.number() })).optional(),
  experience_summary: z.string().optional(),
  target_role: z.string().optional(),
  target_role_years: z.number().int().min(0).optional(),
  experience_level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
  active_resume_version_id: z.string().uuid().optional(),
  display_min_score: z.number().int().min(0).max(100).optional(),
  display_show_skipped: z.boolean().optional(),
  recent_threshold_hours: z.number().int().min(1).max(720).optional(),
  follow_up_days: z.number().int().min(1).max(90).optional(),
  email_notifications_enabled: z.boolean().optional(),
  notify_saved_enabled: z.boolean().optional(),
  notify_saved_days: z.number().int().min(1).max(90).optional(),
  notify_applied_enabled: z.boolean().optional(),
  notify_applied_days: z.number().int().min(1).max(90).optional(),
  notify_interview_enabled: z.boolean().optional(),
  notify_interview_days: z.number().int().min(1).max(90).optional(),
  notify_digest_enabled: z.boolean().optional(),
})

router.patch('/', requireAuth, async (req: Request, res: Response) => {
  const parsed = UpdateProfileSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { data, error } = await supabase
    .from('profiles')
    .update(parsed.data)
    .eq('user_id', req.user!.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// POST /profile/resume — upload PDF, extract text, parse with AI
router.post('/resume', requireAuth, aiLimiter, upload.single('resume'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'Only PDF files accepted' })

  let resumeText: string
  const tmpPath = join(tmpdir(), `resume-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`)
  try {
    writeFileSync(tmpPath, req.file!.buffer)
    // Clear the entire pdf2json module tree to avoid pdfjs global state corruption between requests
    Object.keys(require.cache).forEach(key => { if (key.includes('pdf2json')) delete require.cache[key] })
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PDFParser = require('pdf2json')
    const pdfParser = new PDFParser(null, 1)
    resumeText = await new Promise<string>((resolve, reject) => {
      pdfParser.on('pdfParser_dataReady', () => resolve(pdfParser.getRawTextContent() as string))
      pdfParser.on('pdfParser_dataError', (err: { parserError: Error }) => reject(err.parserError))
      pdfParser.loadPDF(tmpPath)
    }).then(t => t.trim())
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(422).json({ error: 'Could not extract text from PDF', detail: msg })
  } finally {
    try { unlinkSync(tmpPath) } catch {}
  }

  if (!resumeText) return res.status(422).json({ error: 'PDF appears to be empty or image-only' })

  const ai = getAIProvider()
  let aiRaw: string
  try {
    aiRaw = await ai.complete(PARSE_RESUME_SYSTEM, parseResumePrompt(resumeText))
  } catch (err) {
    console.error('[POST /profile/resume] AI call failed:', err)
    return res.status(502).json({ error: 'AI service is temporarily unavailable. Please try again.' })
  }

  let aiJson: unknown
  try {
    aiJson = parseAIJson(aiRaw)
  } catch (err) {
    console.error('[POST /profile/resume] JSON parse failed. Raw AI output:', aiRaw)
    return res.status(502).json({ error: 'AI returned an unexpected response. Please try again.' })
  }

  const validation = ParsedResumeSchema.safeParse(aiJson)
  if (!validation.success) {
    console.error('[POST /profile/resume] Validation failed:', validation.error.flatten())
    return res.status(502).json({ error: 'AI returned an unexpected response. Please try again.' })
  }

  const parsed2 = validation.data
  const label = req.body.label ?? `Resume ${new Date().toISOString().slice(0, 10)}`
  const versionId = crypto.randomUUID()

  // Fetch existing resume_versions
  const { data: profile } = await supabase
    .from('profiles')
    .select('resume_versions')
    .eq('user_id', req.user!.id)
    .single()

  const existingVersions: unknown[] = Array.isArray(profile?.resume_versions) ? profile.resume_versions : []
  const newVersion = {
    id: versionId,
    label,
    text: resumeText,
    created_at: new Date().toISOString(),
    skills_matrix: parsed2.skills,
    cv_analysis: parsed2.cv_analysis,
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      raw_resume_text: resumeText,
      name: parsed2.name,
      skills: parsed2.skills.map(s => s.name),
      experience_years: parsed2.experience_years,
      experience_by_domain: parsed2.experience_by_domain,
      experience_summary: parsed2.experience_summary,
      target_role: parsed2.target_role,
      target_role_years: parsed2.target_role_years,
      experience_level: parsed2.experience_level,
      resume_versions: [...existingVersions, newVersion],
      active_resume_version_id: versionId,
    })
    .eq('user_id', req.user!.id)
    .select()
    .single()

  if (error) {
    console.error('[POST /profile/resume] Supabase update failed:', JSON.stringify({ message: error.message, code: error.code, details: error.details, hint: error.hint }))
    return res.status(500).json({ error: error.message, code: error.code, details: error.details, hint: error.hint })
  }
  return res.json({ profile: data, parsed: parsed2, version_id: versionId })
})

// POST /profile/resume/preview — re-parse a stored version without writing to DB
router.post('/resume/preview', requireAuth, aiLimiter, async (req: Request, res: Response) => {
  const { version_id } = req.body
  if (!version_id || typeof version_id !== 'string') return res.status(400).json({ error: 'version_id required' })

  const { data: profile } = await supabase
    .from('profiles')
    .select('resume_versions')
    .eq('user_id', req.user!.id)
    .single()

  const versions: { id: string; label: string; text: string; created_at: string }[] =
    Array.isArray(profile?.resume_versions) ? profile.resume_versions : []
  const version = versions.find(v => v.id === version_id)
  if (!version) return res.status(404).json({ error: 'Version not found' })

  const ai = getAIProvider()
  let aiRaw: string
  try {
    aiRaw = await ai.complete(PARSE_RESUME_SYSTEM, parseResumePrompt(version.text))
  } catch (err) {
    console.error('[POST /profile/resume/preview] AI call failed:', err)
    return res.status(502).json({ error: 'AI service is temporarily unavailable. Please try again.' })
  }

  let aiJson: unknown
  try {
    aiJson = parseAIJson(aiRaw)
  } catch {
    console.error('[POST /profile/resume/preview] JSON parse failed. Raw AI output:', aiRaw)
    return res.status(502).json({ error: 'AI returned an unexpected response. Please try again.' })
  }

  const validation = ParsedResumeSchema.safeParse(aiJson)
  if (!validation.success) {
    console.error('[POST /profile/resume/preview] Validation failed:', validation.error.flatten())
    return res.status(502).json({ error: 'AI returned an unexpected response. Please try again.' })
  }

  return res.json({ parsed: validation.data, version_id })
})

// PATCH /profile/resume/:versionId — update skills_matrix and/or cv_analysis for a stored version
const UpdateVersionSchema = z.object({
  skills_matrix: z.array(z.object({
    name: z.string(),
    level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  })).optional(),
  cv_analysis: z.string().optional(),
  key_strengths: z.array(z.string()).optional(),
  focus_skills: z.array(z.string()).optional(),
  text: z.string().optional(),
})

router.patch('/resume/:versionId', requireAuth, async (req: Request, res: Response) => {
  const { versionId } = req.params
  const parsed = UpdateVersionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { data: profile } = await supabase
    .from('profiles')
    .select('resume_versions, active_resume_version_id')
    .eq('user_id', req.user!.id)
    .single()

  const versions: unknown[] = Array.isArray(profile?.resume_versions) ? profile.resume_versions : []
  const idx = versions.findIndex((v: unknown) => (v as { id: string }).id === versionId)
  if (idx === -1) return res.status(404).json({ error: 'Version not found' })

  const updated = [...versions]
  updated[idx] = { ...(updated[idx] as object), ...parsed.data }

  const profileUpdates: Record<string, unknown> = { resume_versions: updated }
  // Keep flat skills cache in sync when editing the active version
  if (profile?.active_resume_version_id === versionId && parsed.data.skills_matrix) {
    profileUpdates.skills = parsed.data.skills_matrix.map(s => s.name)
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(profileUpdates)
    .eq('user_id', req.user!.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// DELETE /profile/resume/:versionId — remove a stored version
router.delete('/resume/:versionId', requireAuth, async (req: Request, res: Response) => {
  const { versionId } = req.params

  const { data: profile } = await supabase
    .from('profiles')
    .select('resume_versions, active_resume_version_id')
    .eq('user_id', req.user!.id)
    .single()

  const versions: { id: string; label: string; text: string; created_at: string }[] =
    Array.isArray(profile?.resume_versions) ? profile.resume_versions : []
  const remaining = versions.filter(v => v.id !== versionId)
  if (remaining.length === versions.length) return res.status(404).json({ error: 'Version not found' })

  // If we deleted the active version, set active to the most recent remaining one
  let newActiveId = profile?.active_resume_version_id ?? null
  if (newActiveId === versionId) {
    newActiveId = remaining.length > 0 ? remaining[remaining.length - 1].id : null
  }

  const clearResumeFields = remaining.length === 0
    ? { skills: null, raw_resume_text: null, experience_years: null, experience_by_domain: null, experience_summary: null, target_role: null, target_role_years: null, experience_level: null }
    : {}

  const { data, error } = await supabase
    .from('profiles')
    .update({ resume_versions: remaining, active_resume_version_id: newActiveId, ...clearResumeFields })
    .eq('user_id', req.user!.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

export default router
