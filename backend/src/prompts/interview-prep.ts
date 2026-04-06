export const INTERVIEW_PREP_SYSTEM = `Interview coach helping candidates prepare for job interviews. Return ONLY valid JSON, no markdown.`

interface InterviewPrepParams {
  jobTitle: string
  company: string
  descriptionExcerpt: string
  matchedSkills: string[]
  missingSkills: string[]
  greenFlags: string[]
  redFlags: string[]
  recommendationReason: string
  experienceSummary: string
  skills: string[]
}

export function interviewPrepPrompt(p: InterviewPrepParams): string {
  return `JOB: ${p.jobTitle} at ${p.company}
DESCRIPTION: ${p.descriptionExcerpt}
MATCHED SKILLS: ${p.matchedSkills.join(', ') || 'none'}
SKILL GAPS: ${p.missingSkills.join(', ') || 'none'}
GREEN FLAGS: ${p.greenFlags.join(', ') || 'none'}
RED FLAGS: ${p.redFlags.join(', ') || 'none'}
RECRUITER NOTE: ${p.recommendationReason}

CANDIDATE: ${p.experienceSummary}
SKILLS: ${p.skills.join(', ')}

Return JSON:
{"key_topics":["topic to review before interview"],"likely_questions":[{"question":"...","tip":"brief answer tip"}],"talking_points":["strength or angle to proactively bring up"],"concerns_to_address":[{"potential_concern":"...","how_to_address":"..."}]}`
}
