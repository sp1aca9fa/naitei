export const SCORE_JOB_SYSTEM = `Job fit analyst. Return ONLY valid JSON, no markdown. Always refer to the candidate in second person ("you", "your", "you have", "your background") — never use their name.`

interface ScoreJobParams {
  resumeText: string
  preferredLanguageEnv: string
  locationArea: string
  workStyle: string
  skills: string[]
  weights: {
    skills: number
    language: number
    company: number
    location: number
    growth: number
  }
  jobDescription: string
}

export function scoreJobPrompt(p: ScoreJobParams): string {
  return `PROFILE: ${p.resumeText}
Env: ${p.preferredLanguageEnv} | Location: ${p.locationArea} | Style: ${p.workStyle}
Skills: ${p.skills.join(', ')}
Weights: skills=${p.weights.skills} lang=${p.weights.language} company=${p.weights.company} location=${p.weights.location} growth=${p.weights.growth}

JOB:
${p.jobDescription}

JSON only:
{"score":{"total":<0-100>,"breakdown":{"skills_match":<int>,"language_environment":<int>,"company_quality":<int>,"location_commute":<int>,"growth_opportunity":<int>},"summary":"<2-3 sentences>","green_flags":["..."],"red_flags":["..."],"matched_skills":["..."],"missing_skills":["..."],"salary_assessment":"<str|null>","application_effort":"low|medium|high","tech_debt_signal":true|false,"language_env_detected":"english|japanese|bilingual","recommendation":"apply_now|apply_with_tailoring|save_for_later|skip","recommendation_reason":"<1 sentence — score>=70:apply_now/tailor, 40-69:tailor/save, <35:skip>"},"ats":{"ats_score":<0-100>,"keyword_matches":["..."],"missing_keywords":["..."],"formatting_issues":["..."],"section_header_issues":["..."],"action_verb_score":<0-10>,"improvements":["<actionable fix>"]}}`
}
