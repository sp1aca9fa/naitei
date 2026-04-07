ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_follow_up_days integer NOT NULL DEFAULT 7;
