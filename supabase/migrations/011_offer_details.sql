ALTER TABLE applications ADD COLUMN IF NOT EXISTS offer_monthly_salary integer;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS offer_annual_salary integer;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS offer_bonus_type text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS offer_bonus_amount integer;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS offer_notes text;
