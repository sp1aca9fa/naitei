export const PARSE_RESUME_SYSTEM = `You are a resume parser. Extract structured data from resume text and return ONLY valid JSON with no markdown or preamble.`

export function parseResumePrompt(resumeText: string): string {
  return `Extract structured data from this resume text.
Respond ONLY with valid JSON:
{ "name":"...", "skills":["..."], "experience_years":<int>,
  "experience_summary":"...", "education":"...",
  "notable_projects":["..."], "languages_spoken":["..."] }

RESUME:
${resumeText}`
}
