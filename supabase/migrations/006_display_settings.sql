ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_min_score integer DEFAULT 50;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_show_skipped boolean DEFAULT false;
