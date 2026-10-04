-- ============================================================
-- FirePath — fix feedback saving (step 2)
-- The feedback forms send three fields the table never had, so every
-- submission was rejected (HTTP 400, PGRST204) and no email was sent:
--   is_pro        — whether the person was on Pro when they wrote it
--   pro_interest  — their answer to "would you pay for Pro?" (full form)
--   page_url      — which page the quick feedback button was used on
-- Additive only: existing rows and columns are untouched. Existing grants
-- and the "Allow insert feedback" policy cover the new columns.
-- ============================================================

alter table public.feedback
  add column if not exists is_pro       boolean,
  add column if not exists pro_interest text,
  add column if not exists page_url     text;

-- Make the API pick up the new columns immediately.
notify pgrst, 'reload schema';
