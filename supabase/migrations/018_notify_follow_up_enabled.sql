ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_follow_up_enabled boolean NOT NULL DEFAULT true;
