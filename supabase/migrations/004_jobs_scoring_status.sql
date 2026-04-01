-- Add scoring_status to jobs for tracking AI scoring pipeline state
ALTER TABLE jobs ADD COLUMN scoring_status TEXT DEFAULT NULL;
-- 'pending' | 'scored' | 'failed' | 'skipped'

-- Store full ATS breakdown (keyword_matches, improvements, action_verb_score, etc.)
-- Individual ats_score + ats_issues columns remain for easy querying
ALTER TABLE jobs ADD COLUMN ats_details JSONB;
