alter table profiles add column if not exists target_role text;
alter table profiles add column if not exists target_role_years int default 0;
alter table profiles add column if not exists experience_level smallint;
