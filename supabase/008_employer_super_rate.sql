-- 008: employer super rate (0–1) when above the 12% guarantee, asked on Your full plan.
-- null = the standard 12%. Safe to run more than once.
alter table public.fp_profiles add column if not exists employer_super_rate numeric;
