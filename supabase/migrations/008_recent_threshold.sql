-- Adds configurable "recent" badge threshold per user.
-- Research suggests applicants get significantly more replies when applying within 24-48h of posting.
-- We default to 48h — aligns with the steepest part of the response-rate curve (first 24-48h after posting).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS recent_threshold_hours integer NOT NULL DEFAULT 48;

UPDATE profiles SET recent_threshold_hours = 48 WHERE recent_threshold_hours IS NULL;
