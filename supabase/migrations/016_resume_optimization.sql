ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_optimization jsonb;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_optimization_generated_at timestamptz;
