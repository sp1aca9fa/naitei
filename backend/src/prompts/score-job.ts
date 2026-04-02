export const SCORE_JOB_SYSTEM = `You are a job fit analyst. Evaluate how well a candidate matches a job based on their profile. Return ONLY valid JSON with no markdown or preamble. Always refer to the candidate in second person ("you", "your") — never use their name.`

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
  return `USER PROFILE:
${p.resumeText}
Preferred environment: ${p.preferredLanguageEnv}
Location area: ${p.locationArea}
Work style: ${p.workStyle}
Skills: ${p.skills.join(', ')}

SCORING WEIGHTS:
Skills Match: ${p.weights.skills}/100 | Language/Env: ${p.weights.language}/100
Company Quality: ${p.weights.company}/100 | Location: ${p.weights.location}/100
Growth: ${p.weights.growth}/100

JOB DESCRIPTION:
${p.jobDescription}

Respond ONLY with valid JSON, no markdown, no preamble:
{
  "score": {
    "total": <0-100>,
    "breakdown": { "skills_match": <int>, "language_environment": <int>,
      "company_quality": <int>, "location_commute": <int>, "growth_opportunity": <int> },
    "summary": "<2-3 sentences>",
    "green_flags": ["..."], "red_flags": ["..."],
    "matched_skills": ["..."], "missing_skills": ["..."],
    "salary_assessment": "<string or null>",
    "application_effort": "low|medium|high",
    "tech_debt_signal": true|false,
    "language_env_detected": "english|japanese|bilingual",
    "recommendation": "apply_now|apply_with_tailoring|save_for_later|skip",
    "recommendation_reason": "<one sentence>"
  },
  "ats": {
    "ats_score": <0-100>,
    "keyword_matches": ["..."], "missing_keywords": ["..."],
    "formatting_issues": ["..."], "section_header_issues": ["..."],
    "action_verb_score": <0-10>,
    "improvements": ["<specific actionable fix>"]
  }
}`
}
