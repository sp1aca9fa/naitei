# Naitei

**An AI-powered job hunting dashboard built for the Tokyo tech market.**

Paste a job URL or description from any platform, and Naitei scores it against your resume, checks ATS compatibility, generates a tailored cover letter and interview prep, and tracks your entire pipeline in a Kanban board.

> Built by a recent bootcamp grad while job hunting in Tokyo, because every existing tool either costs $30/month or ignores the Japan market entirely.

---

## The Problem

The junior dev job market is brutal, and the Tokyo market adds extra friction:

- **ATS filters you before any human sees your resume.** 99% of large companies run applications through Applicant Tracking Systems. Most junior applicants get filtered out not because they're unqualified, but because their resume doesn't use the right keywords in the right places.
- **The best jobs disappear within 24-48 hours.** Applying fast matters. Most people find out about jobs days after posting.
- **No good tool covers the Tokyo market.** Wantedly, Green, Findy, and JREC-IN don't have public APIs. English-friendly roles require extra filtering on top of everything else. None of the major paid tools have Japan-specific coverage.
- **Every paid tool is expensive and generic.** JobCopilot ($30/mo), LazyApply ($16/mo), AIApply ($25/mo).. none optimized for: junior dev, Tokyo, English-friendly, bootcamp grad.

---

## What Naitei Does

| Feature | How it works |
|---|---|
| **Paste or URL import** | The primary import flow: paste any job description or drop a URL. The scraper extracts the content automatically; if it can't, it drops into paste mode so you can copy-paste manually. You confirm the job details before it goes to AI: no blind auto-processing |
| **Remotive / RemoteOK import** | Experimental batch import from two free remote job APIs. Useful for volume, but results vary (API content quality is inconsistent). Secondary to the paste flow |
| **AI job scoring** | Every job gets a 0-100 fit score across 5 weighted categories, evaluated against your specific profile and resume |
| **ATS compatibility check** | Separate ATS score: keyword presence, section headers, action verbs, formatting. The stuff robots look for before a human ever reads your CV |
| **Smart pre-filtering** | Blocklist words (e.g. "native Japanese required", "10 years experience") eliminate bad fits before any AI token is spent |
| **Resume parsing** | Upload a PDF; AI extracts skills, experience, and education to auto-populate your profile |
| **Cover letter generator** | One-click per job, using scoring context (matched skills, green flags, company signals) already collected at scoring time |
| **Interview prep** | AI generates likely technical and behavioral questions, talking points, and company research tips for each specific role |
| **Resume optimization** | Per-job AI feedback on how to tailor your resume for that specific listing |
| **Application tracker** | Kanban board: Saved → Applied → Interview → Offer, with notes, recruiter tracking, and offer salary logging |
| **Market insights** | SQL-aggregated: most demanded skills across all your scored jobs, score distribution, top hiring companies |
| **Skills gap tracker** | Which skills appear most often in jobs you scored, ranked by frequency and average job score |
| **Daily digest email** | Automated morning email with top new matches above your score threshold |
| **Auto-fetch cron** | Vercel cron can trigger Remotive/RemoteOK batch imports on a schedule. Experimental: quality depends on the API feed that day |
| **Follow-up reminders** | Automated email nudges for applications that have gone quiet |
| **Company research cards** | AI-generated company overviews (tech stack, culture signals, interview tips), cached in DB so the cost is paid once |

---

## Tech Stack

**Frontend**
- React 18 + TypeScript
- Vite
- TailwindCSS
- React Router v6
- Supabase JS client

**Backend**
- Node.js + TypeScript
- Express
- Zod (validation on all inputs and all AI responses)
- Multer (PDF upload)
- pdf2json (server-side PDF text extraction)
- Axios + Cheerio (URL scraping)
- express-rate-limit
- Resend (email)

**Infrastructure**
- Supabase (PostgreSQL + Auth)
- Vercel (two deployments: frontend as static, backend as serverless)
- Vercel Cron (scheduled jobs)

**AI**
- Provider-agnostic layer: Claude, OpenAI, Gemini, Ollama (local/free), or Mock (dev)
- Swap models via env var, no code changes
- Dedicated scoring model override (`SCORING_AI_MODEL`)
- All AI responses validated with Zod before saving to DB

---

## Architecture

```
┌─────────────────────────────────────────┐
│           FRONTEND (React + TS)          │
│  Vite · TailwindCSS · React Router      │
│  Deployed: Vercel (static)              │
└──────────────────┬──────────────────────┘
                   │ REST API
┌──────────────────▼──────────────────────┐
│           BACKEND (Node + TS)            │
│  Express · Zod · Rate limiting          │
│  Deployed: Vercel (serverless)          │
└────┬──────────────┬───────────────────┬──┘
     │              │                   │
┌────▼────┐  ┌──────▼──────────────┐  ┌▼──────────┐
│Supabase │  │   AI Provider Layer │  │ Import    │
│Postgres │  │ Claude / OpenAI /   │  │ Paste/URL │
│  Auth   │  │ Gemini / Ollama     │  │ Remotive* │
└─────────┘  └─────────────────────┘  │ RemoteOK* │
                                      └───────────┘
                                       * experimental
```

Two independent Vercel deployments. The frontend is a static React SPA; the backend is serverless Express. No Next.js, keeping them separate means the architecture is transparent and each side is independently deployable.

---

## AI Design Decisions

### Provider abstraction

Every AI call in the codebase goes through a single interface:

```typescript
interface AIProvider {
  name: string
  complete(systemPrompt: string, userPrompt: string): Promise<string>
}
```

Switch between Claude, OpenAI, Gemini, and Ollama by changing `AI_PROVIDER` in env, no code changes. A `mock` provider enables full local development with zero API cost.

### Scoring model override

Job scoring can use a different (cheaper) model than the rest of the app via `SCORING_AI_MODEL`. In practice this runs `gemini-2.5-flash-lite` for scoring (many calls per import batch) and a more capable model for cover letters and interview prep (one call per job, on demand).

### Zod on every AI response

AI output is unpredictable. Every prompt response is validated against a Zod schema before anything reaches the database. Malformed JSON, missing fields, or out-of-range values are caught and surface as a `scoring_status: 'failed'` state rather than corrupting saved data.

### Combined scoring + ATS in one call

A single prompt returns both the job-fit score and the ATS analysis. This halves AI costs for the most frequent operation in the app. The scoring model returns structured JSON only. No prose, no markdown wrappers.

### Blocklist pre-filter

Before any AI call, the job description is checked against the user's blocklist words. A match sets `scoring_status: 'skipped'` and skips the AI entirely. This keeps token usage near zero for obvious non-starters.

---

## Scoring Framework

Each job receives a 0-100 fit score across five weighted categories (weights are user-adjustable via sliders in the Profile page):

| Category | Default Weight | What the AI evaluates |
|---|---|---|
| Skills Match | 30pts | Tech stack overlap, seniority fit, required vs. nice-to-have |
| Language & Environment | 25pts | English-friendly signals, international team, remote/hybrid |
| Company Quality | 20pts | Size, reputation, junior-friendliness, mentorship signals |
| Location / Commute | 15pts | Distance from user's area, remote option, Tokyo coverage |
| Growth & Opportunity | 10pts | Learning budget, career path, modern stack, bootcamp-friendly |

Every scored job also gets:
- `recommendation`: `apply_now` / `apply_with_tailoring` / `save_for_later` / `skip`
- `green_flags` and `red_flags` as arrays
- `matched_skills` and `missing_skills`
- `application_effort`: `low` / `medium` / `high`
- `tech_debt_signal`: boolean (detected from job description language)
- `salary_assessment` vs. Tokyo market rates
- Separate `ats_score` with actionable improvement suggestions

---

## Pages

| Route | Page | Status |
|---|---|---|
| `/` | Login (Supabase Auth) | Built |
| `/dashboard` | Stats, top matches, pipeline summary, skills overview, company research card | Built |
| `/jobs` | Job feed with score/source/status/recency filters | Built |
| `/jobs/:id` | Full AI breakdown, both scores, green/red flags, actions | Built |
| `/jobs/analyze` | Paste job text or URL to import and score | Built |
| `/applications` | Kanban tracker + cover letter / interview prep / apply checklist per application | Built |
| `/applications/interview-prep` | Interview prep index | Built |
| `/applications/optimizations` | Resume optimization index | Built |
| `/profile` | Resume upload + version management | Built |
| `/profile/filters` | Display filters (min score, recency threshold, show-skipped) | Built |
| `/profile/weights` | Score weight sliders + blocklist words | Built |
| `/profile/notifications` | Email digest and follow-up reminder settings | Built |
| `/insights` | Skill gaps, demanded skills, score distribution, top companies | Built |

---

## Rate Limiting

| Limiter | Routes | Limit |
|---|---|---|
| `aiLimiter` | Paste import, rescore, interview prep, cover letter, apply checklist, resume optimization | 20/hr |
| `importLimiter` | Remotive and RemoteOK fetch | 10/hr |
| `companyLimiter` | Company research generation | 30/hr |
| `apiLimiter` | Global catch-all | 500/15min |

Cron routes bypass the global limiter and authenticate via `Authorization: Bearer <CRON_SECRET>`.

---

## Environment Variables

```env
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# AI
AI_PROVIDER=claude               # claude | openai | gemini | ollama | mock
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3

# Model overrides
SCORING_AI_MODEL=                # e.g. gemini-2.5-flash-lite (forces Gemini for scoring)
COMPANY_AI_MODEL=                # model for company research, interview prep, cover letters

# Job sources (optional, experimental batch import)
# REMOTIVE_FETCH_COUNT=20        # how many jobs to fetch per run (default: 20)

# Email (Resend)
RESEND_API_KEY=
EMAIL_FROM=onboarding@resend.dev
EMAIL_FROM_NAME=Naitei

# Cron
CRON_SECRET=                     # Required in production

# Behaviour
AI_REQUEST_DELAY_HOURS=24        # Hours before manual AI actions can repeat
JOB_DESCRIPTION_MAX_CHARS=       # Truncate descriptions before sending to AI (unset = no truncation)
FRONTEND_URL=                    # Used in email links

# Frontend mirrors
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=
VITE_AI_REQUEST_DELAY_HOURS=24
VITE_JOB_DESCRIPTION_MAX_CHARS=
```

---

## Local Setup

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- At least one AI provider API key (or use `AI_PROVIDER=mock` for zero-cost local dev)

### 1. Clone and install

```bash
git clone https://github.com/your-username/naitei.git
cd naitei

cd frontend && npm install
cd ../backend && npm install
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Fill in your Supabase credentials and at least one AI provider key. Set `AI_PROVIDER=mock` to develop without any API costs.

### 3. Run the database migrations

Apply the SQL schema from `supabase/` to your Supabase project via the SQL editor or Supabase CLI.

### 4. Start both servers

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

Frontend runs at `http://localhost:5173`, backend at `http://localhost:3000`.

---

## Deployment (Vercel)

Both frontend and backend deploy independently to Vercel.

**Backend:** Connect the `backend/` directory as a Vercel project. The `vercel.json` in that directory configures serverless routing and two cron jobs (daily digest at 07:00 UTC, follow-up reminders at 08:00 UTC).

**Frontend:** Connect the `frontend/` directory as a separate Vercel project. Set all `VITE_*` env vars in the Vercel dashboard.

Set `CRON_SECRET` in both backend env vars and in `vercel.json`. Vercel passes it as the `Authorization` header when triggering cron routes.

---

## Competitive Comparison

| Feature | AIHawk (free) | LazyApply ($16/mo) | JobCopilot ($30/mo) | Naitei |
|---|---|---|---|---|
| Job scoring | No | Basic | Yes | Advanced (5 categories + ATS) |
| ATS check | No | No | Basic | Detailed with actionable fixes |
| Tokyo / JP market | No | No | No | Built for it (paste any JP platform) |
| English-friendly filter | No | No | No | Yes |
| Cover letter gen | Yes | Yes | Yes | Yes (uses scoring context) |
| Interview prep | No | No | Yes | Yes (per role, on demand) |
| Resume optimization | No | No | No | Yes (per job, AI-powered) |
| Application tracker | No | Basic | Yes | Kanban with offer tracking |
| Market insights | No | No | No | Yes (SQL-aggregated, no AI cost) |
| Skills gap tracker | No | No | No | Yes |
| Daily digest email | No | No | Yes | Yes |
| Auto-fetch (cron) | No | Yes | Yes | Experimental (Remotive/RemoteOK) |
| Follow-up reminders | No | No | No | Yes (email + in-app) |
| Company research | No | No | No | Yes (AI-generated, DB-cached) |
| Resume A/B testing | No | No | No | Data collected (UI in Phase 6) |
| Provider-agnostic AI | Partial | No | No | Yes (Claude / OpenAI / Gemini / Ollama) |
| Self-hosted + free | CLI only | No | No | Yes (full web UI) |
| Open source | Yes | No | No | Yes |

---

## Roadmap

Phases 1 through 5 are complete. The remaining work:

**Phase 6: Open Source Polish + Power Features**
- Resume A/B testing UI: the data (`resume_version_used`) has been stored with every scored job since Phase 3. Phase 6 adds the UI to compare which resume version scores higher on average
- Dry run mode: `?dryRun=true` on the scoring route runs the full pipeline without saving, useful for testing prompts or previewing a new resume version
- `docs/AI_PROVIDERS.md`: provider setup guide and cost comparison per provider
- `docs/SETUP.md`: complete local and production setup walkthrough
- Docker Compose for fully self-hosted deployment with no cloud dependency
- Remove all remaining hardcoded personal data for clean open-source use

**Phase 7: Multi-Agent Consensus (Future)**

The AI provider layer already supports multiple providers simultaneously. Phase 7 uses this for selective consensus: cover letter (draft → critique → revise), resume feedback (two models, synthesized output), and optional score disagreement badges when two models diverge by more than 15 points.

---

## Why I Built This

I graduated from Le Wagon Tokyo's web development bootcamp and immediately ran into everything described above: ATS filtering I couldn't see, Tokyo-specific platforms with no APIs, and paid tools that weren't built for my situation.

Building Naitei let me apply what I learned (and go significantly deeper) while solving a real problem I was experiencing daily. The meta-story "I built an AI tool to help me find this job" is intentional. This project demonstrates:

- Full-stack TypeScript (React + Node + Express)
- AI integration with provider abstraction and production-grade output validation
- Supabase (PostgreSQL schema design, Row Level Security, real-time auth)
- REST API design with proper error handling and rate limiting
- Vercel deployment, cron jobs, and serverless architecture
- Product thinking: the feature set is driven by real job-hunting pain points, not tutorial exercises

---

## License

[Polyform Noncommercial 1.0.0](LICENSE)

Free to use, fork, and modify for personal and non-commercial purposes. Commercial use requires explicit permission.
