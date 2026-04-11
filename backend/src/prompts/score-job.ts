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

SCORING PROCESS — follow this order strictly:

STEP 1 — BASE SCORE (no caps, no bonuses yet):
Score each breakdown component independently based on actual match quality.
The base score must reflect genuine fit as if no ceilings exist.

skills_match calibration (use this as your anchor):
• Zero overlap — job requires a completely different tech stack with no shared skills: 0-10
• 1 incidental match out of 5+ required core skills: 10-20
• Partial overlap, missing most core skills: 20-35
• Moderate overlap, some gaps: 40-60
• Strong overlap, minor gaps: 65-80
• Near-complete match: 85-100

STEP 2 — SENIORITY CAP (apply min(base, cap) — the cap can only reduce, never raise):
Compare experience level in target role against the job's seniority requirements.
• Level 1-2 vs. clearly Senior / Lead / Staff / Principal / 5+ years: cap = 50
• Level 1-2 vs. clearly Mid-level / 2-4 years: cap = 65
• Level 3 vs. clearly Senior: cap = 72
• Level 4-5, seniority matches, or role is unspecified: no cap
If your base score is already below the cap, the cap changes nothing.
The cap is not a target — it is only a ceiling. Most seniority-capped jobs with
poor skill match will score well below the cap (e.g. 8, 15, 22).
A user at Exposure or Foundational should never receive apply_now or
apply_with_tailoring for a clearly Senior role regardless of skill match.

CALIBRATION EXAMPLES (internalize these before scoring):
• Bootcamp JS grad (level 2) vs Senior C++ Win32 API role (zero skill overlap):
  base ~8 (zero stack match), cap 50 → final 8. Skip.
• Bootcamp JS grad (level 2) vs Senior Rails role (used Rails slightly):
  base ~22 (partial match, seniority gap), cap 50 → final 22. Skip.
• Mid JS dev (level 3) vs Senior JS role (close but too junior):
  base ~68 (good skills), cap 72 → final 68. Save for later.
• Senior JS dev (level 4) vs Senior JS role (strong match):
  base ~84, no cap → final 84+. Apply now or tailor.

STEP 3 — ADJUSTMENTS:

KEY STRENGTHS:
Key Strengths are the skills the user is most experienced in and can deliver
reliably. If the job's core required skills overlap with key strengths:
• Weight those matches more heavily than ordinary skill matches.
• A job requiring 2 or more key strengths alongside otherwise decent overall
  fit should not score below 70.
• Each key strength match raises confidence in the match quality even if
  other areas are weak.

FOCUS SKILLS:
Focus Skills represent the user's intentional career direction — skills they
are actively building toward, even if not yet proficient.
• If the job meaningfully uses focus skills: add up to +5 points to the total
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
