-- 006: insurance through super (optional, $ a year), asked on Your full plan.
-- Premiums come out of the super balance in the freedom plan (financial-engine.js).
-- Safe to run more than once. The existing row-level security on fp_profiles applies.
alter table public.fp_profiles add column if not exists super_insurance numeric not null default 0;
