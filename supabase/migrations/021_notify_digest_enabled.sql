ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_digest_enabled boolean NOT NULL DEFAULT false;
