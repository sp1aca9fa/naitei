import { Router, Request, Response } from 'express'
import multer from 'multer'
import { z } from 'zod'
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
    .eq('id', req.user!.id)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// PATCH /profile — update preferences, weights, blocklist
const UpdateProfileSchema = z.object({
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
})

router.patch('/', requireAuth, async (req: Request, res: Response) => {
  const parsed = UpdateProfileSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { data, error } = await supabase
    .from('profiles')
    .update(parsed.data)
    .eq('id', req.user!.id)
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
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PDFParser = require('pdf2json')
    const pdfParser = new PDFParser(null, 1)
    resumeText = await new Promise<string>((resolve, reject) => {
      pdfParser.on('pdfParser_dataReady', () => resolve(pdfParser.getRawTextContent() as string))
      pdfParser.on('pdfParser_dataError', (err: { parserError: Error }) => reject(err.parserError))
      pdfParser.parseBuffer(req.file!.buffer)
    }).then(t => t.trim())
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(422).json({ error: 'Could not extract text from PDF', detail: msg })
  }

  if (!resumeText) return res.status(422).json({ error: 'PDF appears to be empty or image-only' })

  const ai = getAIProvider()
  let aiRaw: string
  try {
    aiRaw = await ai.complete(PARSE_RESUME_SYSTEM, parseResumePrompt(resumeText))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI call failed'
    return res.status(502).json({ error: msg })
  }

  let aiJson: unknown
  try {
    aiJson = parseAIJson(aiRaw)
  } catch {
    return res.status(502).json({ error: 'AI returned invalid JSON', raw: aiRaw.slice(0, 200) })
  }

  const validation = ParsedResumeSchema.safeParse(aiJson)
  if (!validation.success) {
    return res.status(502).json({ error: 'AI response failed validation', details: validation.error.flatten() })
  }

  const parsed2 = validation.data
  const label = req.body.label ?? `Resume ${new Date().toISOString().slice(0, 10)}`
  const versionId = crypto.randomUUID()

  // Fetch existing resume_versions
  const { data: profile } = await supabase
    .from('profiles')
    .select('resume_versions')
    .eq('id', req.user!.id)
    .single()

  const existingVersions: unknown[] = Array.isArray(profile?.resume_versions) ? profile.resume_versions : []
  const newVersion = { id: versionId, label, text: resumeText, created_at: new Date().toISOString() }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      raw_resume_text: resumeText,
      name: parsed2.name,
      skills: parsed2.skills,
      experience_years: parsed2.experience_years,
      experience_summary: parsed2.experience_summary,
      resume_versions: [...existingVersions, newVersion],
      active_resume_version_id: versionId,
    })
    .eq('id', req.user!.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ profile: data, parsed: parsed2, version_id: versionId })
})

export default router
