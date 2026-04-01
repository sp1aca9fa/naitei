import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { aiLimiter } from '../middleware/rateLimiter'
import { getAIProvider, MOCK_COMPANY_RESEARCH } from '../services/ai/provider'
import { CompanyResearchSchema } from '../services/ai/schemas'
import { COMPANY_RESEARCH_SYSTEM, companyResearchPrompt } from '../prompts/company-research'
import { parseAIJson } from '../services/ai/parseJson'
import { supabase } from '../lib/supabase'

const router = Router()

// GET /company/search?q=... — partial name search from DB (or mock data)
router.get('/search', requireAuth, async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim()
  if (q.length < 2) return res.json([])

  if (process.env.AI_PROVIDER === 'mock') {
    const matches = Object.keys(MOCK_COMPANY_RESEARCH)
      .filter(k => k.toLowerCase().includes(q.toLowerCase()))
      .map(k => ({ id: k, name: k, research: MOCK_COMPANY_RESEARCH[k] }))
    return res.json(matches)
  }

  const { data, error } = await supabase
    .from('companies')
    .select('id, name, research')
    .ilike('name_normalized', `%${q.toLowerCase()}%`)
    .limit(5)

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

const ResearchRequestSchema = z.object({
  company_name: z.string().min(1).max(200),
  job_title: z.string().max(200).optional(),
})

// POST /company/research — DB-first, AI fallback, saves result to DB
router.post('/research', requireAuth, aiLimiter, async (req: Request, res: Response) => {
  const parsed = ResearchRequestSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { company_name, job_title } = parsed.data
  const normalized = company_name.toLowerCase().trim()

  // Mock mode: lookup mock data, return 404 if not found
  if (process.env.AI_PROVIDER === 'mock') {
    const key = Object.keys(MOCK_COMPANY_RESEARCH).find(k => k.toLowerCase() === normalized)
    if (!key) return res.status(404).json({ error: 'not_found' })
    return res.json(MOCK_COMPANY_RESEARCH[key])
  }

  // DB-first lookup
  const { data: existing } = await supabase
    .from('companies')
    .select('research')
    .eq('name_normalized', normalized)
    .single()

  if (existing) return res.json(existing.research)

  // Not in DB — generate with AI
  const ai = getAIProvider()
  let aiRaw: string
  try {
    aiRaw = await ai.complete(COMPANY_RESEARCH_SYSTEM, companyResearchPrompt(company_name, job_title))
  } catch (err) {
    console.error('[POST /company/research] AI call failed:', err)
    const msg = err instanceof Error ? err.message : 'AI call failed'
    return res.status(502).json({ error: msg })
  }

  let aiJson: unknown
  try {
    aiJson = parseAIJson(aiRaw)
  } catch {
    console.error('[POST /company/research] JSON parse failed. Raw AI output:', aiRaw)
    return res.status(502).json({ error: 'AI returned invalid JSON', raw: aiRaw.slice(0, 500) })
  }

  const validation = CompanyResearchSchema.safeParse(aiJson)
  if (!validation.success) {
    return res.status(502).json({ error: 'AI response failed validation', details: validation.error.flatten() })
  }

  // Save to DB for future lookups
  const { error: saveError } = await supabase.from('companies').insert({
    name: validation.data.company_name,
    name_normalized: validation.data.company_name.toLowerCase().trim(),
    research: validation.data,
  })
  if (saveError) console.error('[POST /company/research] Failed to save to DB:', saveError.message)

  return res.json(validation.data)
})

export default router
