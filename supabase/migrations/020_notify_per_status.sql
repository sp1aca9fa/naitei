-- Rename existing follow-up columns to applied-specific
ALTER TABLE profiles RENAME COLUMN notify_follow_up_enabled TO notify_applied_enabled;
ALTER TABLE profiles RENAME COLUMN notify_follow_up_days TO notify_applied_days;

-- Saved stage notifications (opt-in, longer default threshold)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_saved_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_saved_days int NOT NULL DEFAULT 14;

-- Interview stage notifications
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_interview_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_interview_days int NOT NULL DEFAULT 7;
