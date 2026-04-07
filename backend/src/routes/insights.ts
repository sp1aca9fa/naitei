import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { supabase } from '../lib/supabase'

const router = Router()

// Normalize AI-generated skill names: strip experience-level phrasing, filter vague results.
// e.g. "5+ years expert-level Ruby experience" → "Ruby"
//      "3+ years Full-Stack Developer experience" → "Full-Stack Developer"
//      "developer" alone → null (filtered)
function normalizeSkill(raw: string): string | null {
  let s = raw.trim()

  // Strip leading experience prefix: "5+ years of", "3 years senior", "2+ years expert-level", etc.
  s = s.replace(/^\d+\+?\s*years?\s+(?:of\s+)?(?:(?:expert[-\s]level|senior|junior|mid[-\s]level|principal|staff|lead)\s+)*/i, '')

  // Strip trailing "experience [required/preferred/needed]"
  s = s.replace(/\s+experience(?:\s+(?:required|preferred|needed|a plus|is a plus))?\.?\s*$/i, '')

  // Strip remaining trailing noise
  s = s.replace(/\s+(?:required|preferred|needed|a plus|is a plus)\.?\s*$/i, '').trim()

  // Filter if result is empty or purely generic
  if (!s) return null
  const generic = /^(developer|engineer|programmer|experience|professional|background|skills?|knowledge|understanding|familiarity)$/i
  if (generic.test(s)) return null

  return s
}

// GET /insights — SQL-aggregated insights, no AI calls
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, title, ai_score, company, missing_skills, matched_skills')
    .eq('user_id', req.user!.id)
    .eq('scoring_status', 'scored')

  if (error) return res.status(500).json({ error: error.message })

  const allJobs = jobs ?? []

  // Skill gaps: missing skills ranked by frequency, with per-skill job list and impact score
  type SkillEntry = {
    frequency: number
    scoreSum: number
    jobs: { id: string; title: string; company: string | null; ai_score: number }[]
  }
  const skillMap: Record<string, SkillEntry> = {}

  for (const job of allJobs) {
    for (const raw of (job.missing_skills ?? [])) {
      const skill = normalizeSkill(raw)
      if (!skill) continue
      if (!skillMap[skill]) skillMap[skill] = { frequency: 0, scoreSum: 0, jobs: [] }
      skillMap[skill].frequency++
      skillMap[skill].scoreSum += job.ai_score
      skillMap[skill].jobs.push({ id: job.id, title: job.title, company: job.company ?? null, ai_score: job.ai_score })
    }
  }

  const skillGaps = Object.entries(skillMap)
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .slice(0, 20)
    .map(([skill, entry]) => {
      const avgScore = entry.scoreSum / entry.frequency
      // score_factor: quadratic, 0 at avg≤30, 1 at avg=100 — heavily penalises low-score skills
      const scoreFactor = Math.max(0, avgScore - 30) ** 2 / 4900
      // freq_factor: super-linear — frequency ^ 0.75
      const freqFactor = entry.frequency ** 0.75
      const impact = Math.round(scoreFactor * freqFactor * 10)
      return {
        skill,
        frequency: entry.frequency,
        avg_score: Math.round(avgScore),
        impact,
        jobs: entry.jobs
          .sort((a, b) => b.ai_score - a.ai_score)
          .slice(0, 10),
      }
    })

  // Most demanded skills: matched + missing combined
  const demandedFreq: Record<string, number> = {}
  for (const job of allJobs) {
    for (const skill of [...(job.matched_skills ?? []), ...(job.missing_skills ?? [])]) {
      demandedFreq[skill] = (demandedFreq[skill] ?? 0) + 1
    }
  }
  const demandedSkills = Object.entries(demandedFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([skill, frequency]) => ({ skill, frequency }))

  // Score distribution: five buckets
  const buckets = [
    { label: '80-100', min: 80, max: 100 },
    { label: '60-79', min: 60, max: 79 },
    { label: '40-59', min: 40, max: 59 },
    { label: '20-39', min: 20, max: 39 },
    { label: '0-19', min: 0, max: 19 },
  ]
  const scoreDistribution = buckets.map(b => {
    const inBucket = allJobs
      .filter(j => (j.ai_score ?? 0) >= b.min && (j.ai_score ?? 0) <= b.max)
      .sort((a, bj) => (bj.ai_score ?? 0) - (a.ai_score ?? 0))
    return {
      label: b.label,
      count: inBucket.length,
      jobs: inBucket.slice(0, 10).map(j => ({
        id: j.id,
        title: j.title,
        company: j.company ?? null,
        ai_score: j.ai_score ?? 0,
      })),
    }
  })

  // Top companies by job count
  const companyMap: Record<string, { count: number; totalScore: number; jobs: { id: string; title: string; ai_score: number }[] }> = {}
  for (const job of allJobs) {
    if (!job.company) continue
    if (!companyMap[job.company]) companyMap[job.company] = { count: 0, totalScore: 0, jobs: [] }
    companyMap[job.company].count++
    companyMap[job.company].totalScore += job.ai_score ?? 0
    companyMap[job.company].jobs.push({ id: job.id, title: job.title, ai_score: job.ai_score ?? 0 })
  }
  const topCompanies = Object.entries(companyMap)
    .map(([company, { count, totalScore, jobs }]) => ({
      company,
      count,
      avg_score: Math.round(totalScore / count),
      jobs: jobs.sort((a, b) => b.ai_score - a.ai_score).slice(0, 10),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return res.json({ skillGaps, demandedSkills, scoreDistribution, topCompanies })
})

export default router
