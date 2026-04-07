export const APPLY_CHECKLIST_SYSTEM = `Job application advisor. You help candidates prepare targeted applications. Be concise and actionable. Return ONLY valid JSON, no markdown.`

interface ApplyChecklistParams {
  jobTitle: string
  company: string
  descriptionExcerpt: string
  matchedSkills: string[]
  missingSkills: string[]
  greenFlags: string[]
  redFlags: string[]
  recommendation: string
  recommendationReason: string
  resumeText: string
}

export function applyChecklistPrompt(p: ApplyChecklistParams): string {
  return `JOB: ${p.jobTitle} at ${p.company}
RECOMMENDATION: ${p.recommendation} — ${p.recommendationReason}
MATCHED SKILLS: ${p.matchedSkills.join(', ') || 'none'}
SKILL GAPS: ${p.missingSkills.join(', ') || 'none'}
GREEN FLAGS: ${p.greenFlags.join(', ') || 'none'}
RED FLAGS: ${p.redFlags.join(', ') || 'none'}
DESCRIPTION EXCERPT: ${p.descriptionExcerpt}

CANDIDATE CV:
${p.resumeText}

Generate a quick apply checklist with 4 fields:
- what_to_emphasize: 3-5 specific things from the candidate's actual CV to highlight for this role (reference real projects, roles, or skills from the CV — concrete, not generic)
- what_to_research: 3-5 specific things to look up before applying (company-specific, role-specific)
- resume_tip: one specific tailoring change to make in the CV for this role (e.g. "Move the X project to the top of your experience section", "Reword the Y bullet to mention Z which the JD emphasizes", "Add a skills line for A and B which appear in the JD and are implied by your work at C")
- quick_tips: 2-3 short actionable tips specific to this application

Return JSON: {"what_to_emphasize":["..."],"what_to_research":["..."],"resume_tip":"...","quick_tips":["..."]}`
}
