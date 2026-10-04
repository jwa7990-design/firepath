-- ============================================================
-- UNDO for 001_security_hardening.sql
-- Restores the table grants exactly as they were on 4 Oct 2026 (captured from
-- information_schema.role_table_grants) and removes the is_pro guard.
-- Only use this if the hardening broke something — it re-opens the holes.
-- ============================================================

begin;

drop trigger if exists guard_is_pro on public.users;
drop function if exists public.guard_is_pro();

-- users had: DELETE, INSERT, SELECT, UPDATE (table-wide) for anon + authenticated
revoke insert (id, email, persona), update (id, email, persona) on public.users from authenticated;
grant delete, insert, select, update on public.users to anon, authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.calculations to anon, authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.checkins to anon, authenticated;
grant insert, references, trigger, truncate on public.feedback to anon, authenticated;
grant insert, references, select, trigger, truncate, update on public.financial_learning_progress to anon, authenticated;
grant insert, references, select, trigger, truncate on public.financial_snapshots to anon, authenticated;
grant insert, references, select, trigger, truncate, update on public.fp_profiles to anon, authenticated;
grant insert, references, select, trigger, truncate, update on public.lab_progress to anon, authenticated;

-- learning_articles had REFERENCES, TRIGGER, TRUNCATE and no SELECT
revoke select on public.learning_articles from anon, authenticated;
grant references, trigger, truncate on public.learning_articles to anon, authenticated;

commit;
