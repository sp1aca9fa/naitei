-- ============================================================
-- Naitei — Full Schema (Phase 1)
-- Run this in Supabase SQL editor or via supabase db push
-- ============================================================

-- profiles
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade unique,
  name text,
  email text,
  location_area text,              -- e.g. "Shibuya, Tokyo"
  raw_resume_text text,
  resume_versions jsonb,           -- [{id, label, text, created_at}]
  active_resume_version_id text,
  skills text[],
  experience_years int,
  experience_summary text,
  education text,
  languages_spoken text[],
  preferred_language_env text,     -- 'english_only' | 'bilingual_ok' | 'any'
  salary_min int,                  -- monthly JPY
  salary_max int,
  work_style text[],               -- ['remote', 'hybrid', 'onsite']
  blocklist_words text[],          -- e.g. ['10 years experience', 'native Japanese']
  ai_provider text default 'claude',
  score_weights jsonb,             -- user-adjustable weights
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- jobs
create table jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  title text not null,
  company text,
  location text,
  remote_type text,                -- 'remote' | 'hybrid' | 'onsite'
  description_raw text,
  url text,
  source text,                     -- 'adzuna' | 'remotive' | 'remoteok' | 'paste' | 'url_fetch'
  language_env text,               -- 'english' | 'japanese' | 'bilingual'
  salary_min int,
  salary_max int,
  salary_currency text default 'JPY',
  posted_at timestamptz,
  is_recent boolean,               -- posted within 24hrs
  is_active boolean default true,  -- false when job is stale/expired

  -- AI scoring
  ai_score int,
  ai_score_breakdown jsonb,
  ai_summary text,
  ai_green_flags text[],
  ai_red_flags text[],
  ai_recommendation text,          -- 'apply_now' | 'apply_with_tailoring' | 'save_for_later' | 'skip'
  ai_recommendation_reason text,
  matched_skills text[],
  missing_skills text[],
  ats_score int,
  ats_issues text[],
  application_effort text,         -- 'low' | 'medium' | 'high'
  tech_debt_signal boolean,
  salary_assessment text,
  resume_version_used text,

  scored_at timestamptz,
  created_at timestamptz default now()
);

-- applications
create table applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  status text default 'saved',     -- 'saved'|'applied'|'interview'|'offer'|'rejected'
  notes text,
  cover_letter text,
  applied_at timestamptz,
  follow_up_date timestamptz,
  follow_up_sent boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- skill_gaps (Phase 5, created now to avoid restructuring later)
create table skill_gaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  skill text,
  frequency int default 1,
  last_seen timestamptz,
  updated_at timestamptz default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index jobs_user_id_idx on jobs(user_id);
create index jobs_is_active_idx on jobs(is_active);
create index jobs_ai_score_idx on jobs(ai_score desc);
create index applications_user_id_idx on applications(user_id);
create index applications_job_id_idx on applications(job_id);
create index skill_gaps_user_id_idx on skill_gaps(user_id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table profiles enable row level security;
alter table jobs enable row level security;
alter table applications enable row level security;
alter table skill_gaps enable row level security;

-- profiles: users can only read/write their own
create policy "profiles: own row" on profiles
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- jobs: users can only read/write their own
create policy "jobs: own rows" on jobs
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- applications: users can only read/write their own
create policy "applications: own rows" on applications
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- skill_gaps: users can only read/write their own
create policy "skill_gaps: own rows" on skill_gaps
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- Auto-create profile on signup
-- ============================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into profiles (user_id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- Auto-update updated_at on profiles and applications
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure set_updated_at();

create trigger applications_updated_at
  before update on applications
  for each row execute procedure set_updated_at();
