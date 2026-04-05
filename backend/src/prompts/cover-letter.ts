export const COVER_LETTER_SYSTEM = `Cover letter writer helping candidates apply for jobs. Professional but genuine tone. Tailor the letter to the candidate's actual background and level. Return ONLY valid JSON, no markdown.`

interface CoverLetterParams {
  jobTitle: string
  company: string
  descriptionExcerpt: string
  matchedSkills: string[]
  missingSkills: string[]
  aiSummary: string
  experienceSummary: string
  skills: string[]
}

export function coverLetterPrompt(p: CoverLetterParams): string {
  return `JOB: ${p.jobTitle} at ${p.company}
AI MATCH SUMMARY: ${p.aiSummary}
MATCHED SKILLS: ${p.matchedSkills.join(', ') || 'none'}
SKILL GAPS: ${p.missingSkills.join(', ') || 'none'}
DESCRIPTION EXCERPT: ${p.descriptionExcerpt}

CANDIDATE: ${p.experienceSummary}
SKILLS: ${p.skills.join(', ')}

Write a cover letter: 3-4 short paragraphs, under 280 words, addressed to "Hiring Manager", no placeholder brackets, genuine not generic.
Return JSON: {"text":"full cover letter text"}`
}
