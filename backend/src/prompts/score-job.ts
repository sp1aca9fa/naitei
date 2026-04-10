export const SCORE_JOB_SYSTEM = `Job fit analyst. Return ONLY valid JSON, no markdown.

Language rules (strictly enforced):
- Evaluations, feedback, green_flags, red_flags, summary, recommendation_reason: always second person — "you", "your", "you have", "your background". Never "the candidate", "the user", "the individual", "they", or any third-person reference to the person being evaluated.
- Background descriptions (when summarising a career arc): subjectless sentences with no pronoun or noun subject — "10-year consultant transitioning to software engineering", "Completed a bootcamp in 2023", "No paid experience in the target role yet".
- Never use the user's name.`

const LEVEL_LABELS: Record<number, string> = {
  1: 'Exposure', 2: 'Foundational', 3: 'Working', 4: 'Proficient', 5: 'Expert',
}

interface ScoreJobParams {
  resumeText: string
  preferredLanguageEnv: string
  locationArea: string
  workStyle: string
  experienceLevel: number
  keyStrengths: string[]
  focusSkills: string[]
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
  const levelLabel = LEVEL_LABELS[p.experienceLevel] ?? 'Exposure'

  const signalLines: string[] = [
    `Experience level in target role: ${levelLabel} (${p.experienceLevel}/5)`,
  ]
  if (p.keyStrengths.length > 0) {
    signalLines.push(`Key Strengths (highest-competency skills, reliable delivery): ${p.keyStrengths.join(', ')}`)
  }
  if (p.focusSkills.length > 0) {
    signalLines.push(`Focus Skills (intentional career direction, actively building): ${p.focusSkills.join(', ')}`)
  }

  return `PROFILE:
${p.resumeText}

Env: ${p.preferredLanguageEnv} | Location: ${p.locationArea} | Style: ${p.workStyle}

USER PROFILE SIGNALS:
${signalLines.join('\n')}

SKILL LEVEL REFERENCE (for interpreting levels in the profile's technical skills list):
Exposure(1) = tutorials/hello world only, not job-ready
Foundational(2) = completed formal training, limited production exposure
Working(3) = 2+ years paid production use, independently capable
Proficient(4) = 4-5 years, led features or mentored others
Expert(5) = 6+ years deep mastery, architectural decisions

SCORING ADJUSTMENTS — apply these after your base skill and experience analysis:

1. SENIORITY CAP
   Compare the experience level in target role against the job's seniority requirements.
   • Level 1-2 vs. a role that clearly requires Senior / Lead / Staff / Principal / 5+ years:
     cap the total score at 50; recommendation must be save_for_later or skip.
   • Level 1-2 vs. a role that clearly requires Mid-level / 2-4 years:
     cap the total score at 65.
   • Level 3 vs. a role that clearly requires Senior:
     cap the total score at 72.
   • Level 4-5, or seniority matches well, or the role is unspecified: no cap.
   A user at Exposure or Foundational should never receive apply_now or
   apply_with_tailoring for a clearly Senior role regardless of skill match.

2. KEY STRENGTHS
   Key Strengths are the skills the user is most experienced in and can deliver
   reliably. If the job's core required skills overlap with key strengths:
   • Weight those matches more heavily than ordinary skill matches.
   • A job requiring 2 or more key strengths alongside otherwise decent overall
     fit should not score below 70.
   • Each key strength match raises confidence in the match quality even if
     other areas are weak.

3. FOCUS SKILLS
   Focus Skills represent the user's intentional career direction — skills they
   are actively building toward, even if not yet proficient.
   • If the job meaningfully uses focus skills: add up to +8 points to the total
     score for career alignment.
   • If the user's current proficiency on a focus skill is low (Exposure or
     Foundational) but the job uses it: be lenient on that specific gap — frame
     it as a growth opportunity in green_flags or summary rather than a
     disqualifier in red_flags.
   • Do not apply the bonus if focus skills appear only incidentally in the JD.
   • Never inflate the score purely on focus skills if the job's core required
     skills are missing from the user's profile.

WEIGHTS:
skills=${p.weights.skills} lang=${p.weights.language} company=${p.weights.company} location=${p.weights.location} growth=${p.weights.growth}

JOB:
${p.jobDescription}

JSON only:
{"score":{"total":<0-100>,"breakdown":{"skills_match":<int>,"language_environment":<int>,"company_quality":<int>,"location_commute":<int>,"growth_opportunity":<int>},"summary":"<2-3 sentences>","green_flags":["..."],"red_flags":["..."],"matched_skills":["concise skill name only, e.g. Python"],"missing_skills":["concise skill name only — never experience requirements like '5+ years Ruby', just 'Ruby'"],"salary_assessment":"<str|null>","application_effort":"low|medium|high","tech_debt_signal":true|false,"language_env_detected":"english|japanese|bilingual","recommendation":"apply_now|apply_with_tailoring|save_for_later|skip","recommendation_reason":"<1 sentence — score>=70:apply_now/tailor, 40-69:tailor/save, <35:skip>"},"ats":{"ats_score":<0-100>,"keyword_matches":["..."],"missing_keywords":["..."],"formatting_issues":["..."],"section_header_issues":["..."],"action_verb_score":<0-10>,"improvements":["<actionable fix>"]}}`
}
