-- 007: how much of someone's investments are Australian shares (0–1), for franking
-- credits. Optional on Your full plan (None 0 / Some 0.4 / Most 0.7); null = not said,
-- so FirePath assumes a typical mix for shares/ETFs. Safe to run more than once.
alter table public.fp_profiles add column if not exists aus_share numeric;
