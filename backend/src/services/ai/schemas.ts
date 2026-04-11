import { z } from 'zod'

const SkillLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])

export const SkillEntrySchema = z.object({
  name: z.string(),
  level: SkillLevelSchema,
})

export type SkillEntry = z.infer<typeof SkillEntrySchema>

export const ParsedResumeSchema = z.object({
  name: z.string(),
  skills: z.array(SkillEntrySchema),
  experience_years: z.number().int(),
  experience_by_domain: z.array(z.object({ domain: z.string(), years: z.number() })),
  experience_summary: z.string(),
  cv_analysis: z.string(),
  target_role: z.string(),
  target_role_years: z.number().int().min(0),
  experience_level: SkillLevelSchema,
  education: z.union([z.string(), z.array(z.string()).transform(a => a.join(', '))]),
  notable_projects: z.array(z.string()),
  languages_spoken: z.array(z.string()),
})

export type ParsedResume = z.infer<typeof ParsedResumeSchema>

// Coerce and round any numeric value — handles floats and stringified numbers from AI
const RobustInt = z.coerce.number().transform(Math.round)
const ClampedScore = z.coerce.number().transform(v => Math.min(100, Math.max(0, Math.round(v))))

// Normalize enum strings: lowercase + spaces/hyphens to underscores
function normalizeEnumValue(v: unknown): unknown {
  return typeof v === 'string' ? v.toLowerCase().replace(/[\s-]+/g, '_') : v
}
function robustEnum<T extends [string, ...string[]]>(values: T) {
  return z.preprocess(normalizeEnumValue, z.enum(values))
}

// Normalize common AI structural mismatches before Zod validation runs
function normalizeJobScoreRoot(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw
  const obj = raw as Record<string, unknown>
  // AI sometimes returns {"score": {...}} instead of {"fit": {...}}
  if (!obj.fit && obj.score && typeof obj.score === 'object') {
    return { ...obj, fit: obj.score }
  }
  return obj
}

export const JobScoreSchema = z.preprocess(normalizeJobScoreRoot, z.object({
  fit: z.object({
    score: ClampedScore,
    skills_match: RobustInt,
    seniority_match: RobustInt,
    experience_relevance: RobustInt,
    matched_skills: z.array(z.string()),
    missing_skills: z.array(z.string()),
    summary: z.string(),
    green_flags: z.array(z.string()),
    red_flags: z.array(z.string()),
    salary_assessment: z.preprocess(v => v ?? null, z.string().nullable()),
    application_effort: robustEnum(['low', 'medium', 'high']),
    tech_debt_signal: z.preprocess(v => v === 'true' ? true : v === 'false' ? false : v, z.boolean()),
    language_env_detected: robustEnum(['english', 'japanese', 'bilingual']),
    recommendation: robustEnum(['apply_now', 'apply_with_tailoring', 'save_for_later', 'skip']),
    recommendation_reason: z.string(),
  }),
  ats: z.object({
    score: ClampedScore,
    keyword_matches: z.array(z.string()),
    missing_keywords: z.array(z.string()),
    action_verb_score: z.coerce.number().transform(v => Math.min(10, Math.max(0, v))),
    improvements: z.array(z.string()),
  }).optional(),
}))

export type JobScore = z.infer<typeof JobScoreSchema>

export const CompanyResearchSchema = z.object({
  company_name: z.string(),
  overview: z.string(),
  known_for: z.string(),
  tech_stack: z.array(z.string()),
  culture_signals: z.array(z.string()),
  green_flags: z.array(z.string()),
  red_flags: z.array(z.string()),
  interview_tips: z.array(z.string()),
  typical_roles: z.array(z.string()),
})

export type CompanyResearch = z.infer<typeof CompanyResearchSchema>

export const InterviewPrepSchema = z.object({
  key_topics: z.array(z.string()),
  likely_questions: z.array(z.object({ question: z.string(), tip: z.string() })),
  talking_points: z.array(z.string()),
  concerns_to_address: z.array(z.object({ potential_concern: z.string(), how_to_address: z.string() })),
})

export type InterviewPrep = z.infer<typeof InterviewPrepSchema>

export const CoverLetterSchema = z.object({
  text: z.string().min(50),
})

export const ApplyChecklistSchema = z.object({
  what_to_emphasize: z.array(z.string()),
  what_to_research: z.array(z.string()),
  resume_tip: z.string(),
  quick_tips: z.array(z.string()),
})

export type ApplyChecklist = z.infer<typeof ApplyChecklistSchema>

export const ResumeOptimizationSchema = z.object({
  verdict: z.enum(['strong', 'needs_tweaks', 'major_overhaul']),
  summary: z.string(),
  improvements: z.array(z.object({
    area: z.string(),
    issue: z.string(),
    suggestion: z.string(),
    rewrite: z.preprocess(v => (typeof v === 'string' ? v : null), z.string().nullish()),
  })),
  priority_actions: z.array(z.string()),
})

export type ResumeOptimization = z.infer<typeof ResumeOptimizationSchema>
