ALTER TABLE applications ADD COLUMN IF NOT EXISTS apply_checklist jsonb;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS apply_checklist_generated_at timestamptz;
