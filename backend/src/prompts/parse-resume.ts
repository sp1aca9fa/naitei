export const PARSE_RESUME_SYSTEM = `You are a resume parser. Extract structured data from resume text and return ONLY valid JSON with no markdown or preamble.`

export function parseResumePrompt(resumeText: string): string {
  return `Extract structured data from this resume text.
Respond ONLY with valid JSON:
{
  "name": "...",
  "skills": ["..."],
  "experience_years": <total years of ALL professional work, any field>,
  "experience_by_domain": [{ "domain": "...", "years": <int> }],
  "experience_summary": "...",
  "education": "...",
  "notable_projects": ["..."],
  "languages_spoken": ["..."]
}

For experience_by_domain, break down the person's career by field or industry (e.g. "Web Development", "Marketing", "Accounting"). Be specific about the domain. If the person has only one career, return a single-item array.

RESUME:
${resumeText}`
}
