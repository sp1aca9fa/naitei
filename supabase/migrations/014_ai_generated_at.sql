ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_prep_generated_at timestamptz;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS cover_letter_generated_at timestamptz;
