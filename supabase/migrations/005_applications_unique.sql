-- Ensure upsert on (user_id, job_id) works for re-saving applications
ALTER TABLE applications ADD CONSTRAINT applications_user_job_unique UNIQUE (user_id, job_id);
