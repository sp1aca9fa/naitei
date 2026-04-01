import { z } from 'zod'

export const ParsedResumeSchema = z.object({
  name: z.string(),
  skills: z.array(z.string()),
  experience_years: z.number().int(),
  experience_by_domain: z.array(z.object({ domain: z.string(), years: z.number() })),
  experience_summary: z.string(),
  education: z.union([z.string(), z.array(z.string()).transform(a => a.join(', '))]),
  notable_projects: z.array(z.string()),
  languages_spoken: z.array(z.string()),
})

export type ParsedResume = z.infer<typeof ParsedResumeSchema>

export const JobScoreSchema = z.object({
  score: z.object({
    total: z.number().int().min(0).max(100),
    breakdown: z.object({
      skills_match: z.number().int(),
      language_environment: z.number().int(),
      company_quality: z.number().int(),
      location_commute: z.number().int(),
      growth_opportunity: z.number().int(),
    }),
    summary: z.string(),
    green_flags: z.array(z.string()),
    red_flags: z.array(z.string()),
    matched_skills: z.array(z.string()),
    missing_skills: z.array(z.string()),
    salary_assessment: z.string().nullable(),
    application_effort: z.enum(['low', 'medium', 'high']),
    tech_debt_signal: z.boolean(),
    language_env_detected: z.enum(['english', 'japanese', 'bilingual']),
    recommendation: z.enum(['apply_now', 'apply_with_tailoring', 'save_for_later', 'skip']),
    recommendation_reason: z.string(),
  }),
  ats: z.object({
    ats_score: z.number().int().min(0).max(100),
    keyword_matches: z.array(z.string()),
    missing_keywords: z.array(z.string()),
    formatting_issues: z.array(z.string()),
    section_header_issues: z.array(z.string()),
    action_verb_score: z.number().min(0).max(10),
    improvements: z.array(z.string()),
  }),
})

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
