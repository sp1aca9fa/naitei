ALTER TABLE profiles ALTER COLUMN display_min_score SET DEFAULT 50;
UPDATE profiles SET display_min_score = 50 WHERE display_min_score IS NULL OR display_min_score = 0;
