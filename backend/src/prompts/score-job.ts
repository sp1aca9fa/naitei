export const SCORE_JOB_SYSTEM = `Job fit analyst. Return ONLY valid JSON, no markdown.
The root JSON object must have a "fit" key. Never use "score", "total", or any other root key. Never invent your own structure — follow the template at the end of the prompt exactly.

Language rules (strictly enforced):
- Evaluations, feedback, green_flags, red_flags, summary, recommendation_reason: always second person — "you", "your", "you have", "your background". Never "the candidate", "the user", "the individual", "they", or any third-person reference to the person being evaluated.
- Background descriptions (when summarising a career arc): subjectless sentences with no pronoun or noun subject — "10-year consultant transitioning to software engineering", "Completed a bootcamp in 2023", "No paid experience in the target role yet".
- Never use the user's name.`

const LEVEL_LABELS: Record<number, string> = {
  1: 'Exposure', 2: 'Foundational', 3: 'Working', 4: 'Proficient', 5: 'Expert',
}

interface ScoreJobParams {
  resumeText: string
  rawResumeText: string | null
  preferredLanguageEnv: string
  locationArea: string
  workStyle: string
  experienceLevel: number
  keyStrengths: string[]
  focusSkills: string[]
  jobDescription: string
}

export function scoreJobPrompt(p: ScoreJobParams): string {
  const levelLabel = LEVEL_LABELS[p.experienceLevel] ?? 'Exposure'

  const signalLines: string[] = [
    `Target role experience level: ${levelLabel} (${p.experienceLevel}/5)`,
  ]
  if (p.keyStrengths.length > 0) {
    signalLines.push(`Key Strengths (reliable delivery, highest competency): ${p.keyStrengths.join(', ')}`)
  }
  if (p.focusSkills.length > 0) {
    signalLines.push(`Focus Skills (career priority — skills the user has and wants to apply more of): ${p.focusSkills.join(', ')}`)
  }

  const rawCvBlock = p.rawResumeText
    ? `RAW CV (primary input for ATS scoring; supporting evidence only for fit scoring):
${p.rawResumeText}`
    : `RAW CV: not available — omit the "ats" key from your response.`

  const atsInstructions = p.rawResumeText
    ? `━━━ SCORE 3: ATS — "Will this CV pass automated screening?" ━━━
Inputs: RAW CV ONLY. Do not use the profile summary or inferred skill levels.
Evaluate: exact keyword presence in the raw CV text vs. job requirements, action verb quality, language alignment with the job posting.
Do not infer skills — only score what is literally written in the raw CV text.`
    : `━━━ SCORE 3: ATS ━━━
Raw CV not available — omit the "ats" key from your response entirely.`

  const jsonTemplate = `{"fit":{"score":<0-100>,"skills_match":<int>,"seniority_match":<int>,"experience_relevance":<int>,"matched_skills":["concise skill name only, e.g. Python"],"missing_skills":["concise skill name only — never experience requirements like '5+ years Ruby', just 'Ruby'"],"summary":"<2-3 sentences>","green_flags":["..."],"red_flags":["..."],"salary_assessment":"<str|null>","application_effort":"low|medium|high","tech_debt_signal":true|false,"language_env_detected":"english|japanese|bilingual","recommendation":"apply_now|apply_with_tailoring|save_for_later|skip","recommendation_reason":"<1 sentence>"}${p.rawResumeText ? ',"ats":{"score":<0-100>,"keyword_matches":["..."],"missing_keywords":["..."],"action_verb_score":<0-10>,"improvements":["<actionable fix>"]}' : ''}}`

  return `PROFILE SUMMARY (primary input — AI-interpreted profile with skill levels and career context):
${p.resumeText}

${rawCvBlock}

USER SIGNALS:
${signalLines.join('\n')}
Preferred language env: ${p.preferredLanguageEnv} | Location: ${p.locationArea} | Work style: ${p.workStyle}

SKILL LEVEL REFERENCE:
Exposure(1)=tutorials/hello world only, not job-ready
Foundational(2)=completed formal training, limited production exposure
Working(3)=2+ years paid production use, independently capable
Proficient(4)=4-5 years, led features or mentored others
Expert(5)=6+ years deep mastery, architectural decisions

━━━ SCORE 1: FIT — "Is this person technically qualified?" ━━━
Inputs: PROFILE SUMMARY (primary) + RAW CV (supporting evidence)
Evaluate: skill match, seniority match, experience relevance
Do NOT factor in company quality, growth potential, language environment, location, or career direction.

STEP 1 — BASE FIT SCORE (score independently, no caps applied yet):
skills_match calibration — internalize these anchors:
• Zero overlap: job requires a completely different tech stack with no shared skills → 0-10
• 1-2 incidental matches out of 5+ required core skills → 10-20
• Partial overlap, missing most core skills → 20-35
• Moderate overlap, some notable gaps → 40-60
• Strong overlap, minor gaps → 65-80
• Near-complete match → 85-100

seniority_match: How well the experience level matches the role's seniority requirements. Junior applying to senior = very low. Perfect seniority match = high.
experience_relevance: How relevant is the overall background to this type of work, regardless of specific skills.

STEP 2 — SENIORITY CAP (apply min(base, cap) — cap can only reduce, never anchor or raise):
• Level 1-2 vs. Senior/Lead/Staff/Principal/5+ years: cap = 50
• Level 1-2 vs. Mid-level/2-4 years: cap = 65
• Level 3 vs. Senior: cap = 72
• Level 4-5, seniority matches, or role is unspecified: no cap
The cap is NOT a target. If the base score is already below the cap, the cap changes nothing.
Most seniority-capped jobs with poor skill match score well below the cap (e.g. 8, 15, 22).

STEP 3 — KEY STRENGTHS:
Key Strengths = skills the user delivers reliably in production at high competency.
• If 2+ key strengths overlap with the job's core required skills: fit should not score below 70 when overall fit is otherwise decent.
• Each key strength match raises confidence in the fit even if other areas are weak.
• NEVER list a Key Strength or Focus Skill in missing_skills — those skills are confirmed present in the user's profile.

STEP 4 — FOCUS SKILLS BONUS (max +5):
Focus Skills = skills the user already has and is prioritising as their career direction — not absent skills, but skills they want to apply more of. A role that primarily uses these is motivating and growth-accelerating — apply a small upward nudge.
Scale the bonus by how central focus skills are to this job's core requirements:
• Focus skills not required or only incidentally mentioned → 0
• 1 focus skill is among the core requirements → +1–2
• 2 focus skills are among the core requirements → +2–3
• Focus skills make up the majority of core requirements → +4–5
Skip this step if focus_skills is empty.

FIT CALIBRATION EXAMPLES — internalize before scoring:
• Bootcamp JS grad (L2) vs Senior C++ Win32 role (zero overlap): base ~8, cap 50 → fit 8. Skip.
• Bootcamp JS grad (L2) vs Senior Rails role (minor overlap): base ~22, cap 50 → fit 22. Skip.
• Mid JS dev (L3) vs Senior JS role (good skills, seniority gap): base ~68, cap 72 → fit 68. Save/tailor.
• Senior JS dev (L4) vs Senior JS role (strong match): base ~84, no cap → fit 84. Apply.

━━━ RECOMMENDATION (holistic judgment based on fit score) ━━━
• fit < 30: skip
• fit 30-50: skip or save_for_later depending on context
• fit 50-70: apply_with_tailoring
• fit ≥ 70: apply_now or apply_with_tailoring based on remaining gaps
• If ATS < 45 and the user should apply: always apply_with_tailoring (needs keyword tailoring first)
• User at Exposure or Foundational must never receive apply_now for a clearly Senior role.

${atsInstructions}

JOB:
${p.jobDescription}

IMPORTANT — output ONLY this JSON structure, no other keys, no wrapper:
${jsonTemplate}`
}
