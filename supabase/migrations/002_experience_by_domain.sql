alter table profiles
  add column if not exists experience_by_domain jsonb; -- [{domain: string, years: number}]
