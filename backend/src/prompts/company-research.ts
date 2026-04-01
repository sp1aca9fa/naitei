export const COMPANY_RESEARCH_SYSTEM = `You are a company research assistant for junior web developers job hunting in Tokyo. Return ONLY valid JSON with no markdown or preamble.`

export function companyResearchPrompt(companyName: string, jobTitle?: string): string {
  return `Research the company "${companyName}"${jobTitle ? ` for the role "${jobTitle}"` : ''}.

Return a JSON object with:
- company_name: string (normalized company name)
- overview: string (2-3 sentences: what the company does, size, stage)
- known_for: string (one sentence: what they are best known for in the tech/dev community)
- tech_stack: string[] (technologies they are known to use)
- culture_signals: string[] (work culture observations, e.g. "fast-paced", "English-friendly", "strong engineer autonomy")
- green_flags: string[] (positive signals for a junior dev)
- red_flags: string[] (potential concerns for a junior dev)
- interview_tips: string[] (specific tips for interviewing at this company)
- typical_roles: string[] (common engineering roles they hire for)

If you have limited information about this company, make clear what is known vs inferred. Be honest about uncertainty.`
}
