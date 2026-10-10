-- Undo 007. The site keeps saving without it (it retries without the field).
alter table public.fp_profiles drop column if exists aus_share;
