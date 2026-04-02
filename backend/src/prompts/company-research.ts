export const COMPANY_RESEARCH_SYSTEM = `You are a company research assistant for candidates job hunting. Return ONLY valid JSON with no markdown or preamble.`

export function companyResearchPrompt(companyName: string, jobTitle?: string): string {
  return `Research the company "${companyName}"${jobTitle ? ` for the role "${jobTitle}"` : ''}.

Return a JSON object with:
- company_name: string (normalized company name)
- overview: string (2-3 sentences: what the company does, size, stage)
- known_for: string (one sentence: what they are best known for in the tech/dev community)
- tech_stack: string[] (technologies they are known to use)
- culture_signals: string[] (work culture observations, e.g. "fast-paced", "async-friendly", "strong engineer autonomy", "flat hierarchy")
- green_flags: string[] (concrete positive signals for a junior dev — e.g. "publicly active OSS contributors", "structured onboarding mentioned in job posts", "positive junior engineer reviews on Glassdoor", "modern tech stack suggests good engineering practices", "small team means more ownership", "remote-first culture". Infer from available signals — tech choices, company type, public presence. Do NOT write "Cannot identify" — always provide at least 1-2 inferred signals.)
- red_flags: string[] (concrete concerns for a junior dev — e.g. "high turnover reported on Glassdoor", "legacy tech stack with no modern tooling", "job posts require 5+ years for junior roles", "no mention of mentorship or growth". Infer from available signals. If no red flags found, return an empty array.)
- interview_tips: string[] (specific tips for interviewing at this company, based on their known culture and tech)
- typical_roles: string[] (common engineering roles they hire for)

If information is limited, infer from what IS known (tech stack, company type, size, public presence). Prefix uncertain inferences with "likely" or "based on company type". Never return "Cannot identify" — always attempt a reasoned inference.`
}
