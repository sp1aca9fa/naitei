export const PARSE_RESUME_SYSTEM = `You are a resume parser. Extract structured data from resume text and return ONLY valid JSON with no markdown or preamble.`

export function parseResumePrompt(resumeText: string): string {
  return `Extract structured data from this resume and return ONLY valid JSON matching the schema below.

─── SKILL LEVEL ASSIGNMENT ──────────────────────────────────────────────────
Assign each skill a level 1-5 by following these rules in strict order. Start at 1. Only raise if explicit evidence exists in the CV.

  DEFAULT → Level 1 (Exposure)
  All skills start here. Personal projects, side projects, and portfolio projects
  alone — no matter how complex — do NOT raise a skill above level 1.

  RAISE TO 2 (Foundational) — only if BOTH conditions are met:
    a) The skill is a core technology of a formal training program (bootcamp,
       university course, professional certification) explicitly named in the CV.
    b) The person completed that program.
    "Core" means the program centers on this language or framework, not that it
    was briefly mentioned in one lesson. When uncertain, do NOT raise to 2.

  RAISE TO 3 (Working) — only if there is explicit evidence of ~2+ years of
  PAID professional employment using the skill in production systems with real
  users. No exceptions for side projects, bootcamp projects, or personal work.

  RAISE TO 4 (Proficient) — only for ~4-5 years of paid professional use with
  evidence of leading features or mentoring others.

  RAISE TO 5 (Expert) — only for 6+ years of deep professional mastery,
  architectural decisions, or recognized public contributions.

  WHEN UNCERTAIN → always assign the lower level. The user reviews skill levels
  after analysis and will correct any mistakes. Under-estimating is safe;
  over-estimating harms job match accuracy.

  Level reference:
  1 = Exposure  |  2 = Foundational  |  3 = Working  |  4 = Proficient  |  5 = Expert

─── SKILL SELECTION ─────────────────────────────────────────────────────────
Only include skills that appear in job postings as standalone requirements.
  INCLUDE: programming languages, major frameworks, databases, cloud platforms
           (AWS/GCP/Azure), containerization (Docker/Kubernetes), major dev tools
           (Git, CI/CD, Linux).
  EXCLUDE: gems, npm packages, ODMs, plugins, minor utilities, specific API clients,
           and sub-tools that are part of a framework you already listed.
           Examples to exclude: Devise, Hotwire, Turbo, ActiveRecord (→ Rails covers
           these), Mongoose (→ MongoDB covers this), Puppeteer, Cloudinary SDK,
           Google Sheets API, any named SDK or API wrapper.

─── TARGET ROLE ─────────────────────────────────────────────────────────────
Infer the role the person is applying for based on recent activity, skills
emphasis, and career trajectory. May differ from their longest domain (e.g. a
consultant who completed a coding bootcamp likely targets Software Engineer roles).
Be specific: "Software Engineer", "Data Analyst", "Frontend Developer".

─── TARGET ROLE EXPERIENCE LEVEL ────────────────────────────────────────────
Same 1-5 scale, applied to the target role only (not overall career).
  - Career changer with no paid work in target role → maximum level 2.
  - Bootcamp graduate with side projects only → level 1 or 2.
  - Level 3+ requires ~2 years of paid professional work in the target role.
  Default to 1. Raise to 2 only if formal training in the target field is complete.

TARGET ROLE YEARS — years of PAID professional work in the target role.
Set to 0 for career changers. Personal projects do not count.

─── CV ANALYSIS ─────────────────────────────────────────────────────────────
2-4 sentences. Use subjectless sentences — no pronouns, no "the candidate", no
"the individual", no "the person", no "they". The first sentence establishes
context through the background itself (e.g. "10-year Big 4 consultant transitioning
to software development." or "Bootcamp graduate with a finance background.").
Subsequent sentences drop the subject entirely (e.g. "Recently completed...",
"No evidence of paid experience in...", "Actively building...").
Summarize: career arc, how well the CV positions them for the target role,
notable strengths, visible gaps. Be honest and specific.

─── EXPERIENCE SUMMARY ──────────────────────────────────────────────────────
Compact block consumed by the job-matching AI. Use label names, not numbers.
Format exactly:
"Target role: [role] ([level label], [N] years in field)
Total experience: [N] years ([domain1]: [N]yr, [domain2]: [N]yr)
Technical skills: [Skill (Label), Skill (Label), ...]
Education: [brief]
Notable: [relevant projects or achievements]"

─── JSON SCHEMA ─────────────────────────────────────────────────────────────
Return ONLY this object, no extra keys, no markdown:
{
  "name": "full name",
  "skills": [{ "name": "skill name", "level": 1-5 }],
  "experience_years": <total years ALL professional work any field, integer>,
  "experience_by_domain": [{ "domain": "field or industry name", "years": <integer> }],
  "experience_summary": "...",
  "cv_analysis": "...",
  "target_role": "specific role title",
  "target_role_years": <integer, 0 for career changers>,
  "experience_level": <1-5 integer, level in target role only>,
  "education": "...",
  "notable_projects": ["..."],
  "languages_spoken": ["..."]
}

RESUME:
${resumeText}`
}
