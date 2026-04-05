ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_round integer DEFAULT 1;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS recruiter_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS follow_up_days integer DEFAULT 7;
