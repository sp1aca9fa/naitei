export const RESUME_OPTIMIZATION_SYSTEM = `You are a senior technical recruiter and CV coach specializing in software engineering roles in Japan. Your job is to give brutally honest, specific, actionable feedback on a candidate's CV for a specific job. You reference the actual content of their CV — never give generic advice. If the CV needs a full rewrite, say so clearly.

Important: Always refer to the candidate as "you" or "your" — never by their name.
Return ONLY valid JSON, no markdown.`

interface ResumeOptimizationParams {
  jobTitle: string
  company: string
  jobDescription: string
  matchedSkills: string[]
  missingSkills: string[]
  recommendation: string
  recommendationReason: string
  resumeText: string
}

export function resumeOptimizationPrompt(p: ResumeOptimizationParams): string {
  return `TARGET JOB: ${p.jobTitle} at ${p.company}
RECRUITER ASSESSMENT: ${p.recommendation} — ${p.recommendationReason}
MATCHED SKILLS: ${p.matchedSkills.join(', ') || 'none'}
SKILL GAPS: ${p.missingSkills.join(', ') || 'none'}

JOB DESCRIPTION:
${p.jobDescription}

CANDIDATE CV:
${p.resumeText}

Analyze the CV against this specific job and return a detailed optimization report.

Rules:
- Always refer to the candidate as "you"/"your", never by name
- Reference actual content from the CV (project names, job titles, company names, specific bullets)
- Give as many improvements as the CV needs — do not artificially limit yourself
- For each improvement, provide a rewrite when applicable — this must be a plain string (the improved version only, not a before/after object)
- If the CV needs structural changes, say so explicitly
- Be direct and honest — if something is weak, say it clearly
- Focus on what will move the needle for THIS specific job, not generic CV advice

Return JSON with this structure:
{
  "verdict": "strong" | "needs_tweaks" | "major_overhaul",
  "summary": "2-3 sentence honest overall assessment",
  "improvements": [
    {
      "area": "section or aspect (e.g. 'Experience at Acme Corp', 'Skills section', 'Project: Foo')",
      "issue": "what is wrong or suboptimal",
      "suggestion": "what to do about it",
      "rewrite": "optional — plain string with the improved text only (not an object, not before/after — just the new version)"
    }
  ],
  "priority_actions": ["Most impactful change first", "...as many as needed"]
}`
}
