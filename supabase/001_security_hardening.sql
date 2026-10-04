-- ============================================================
-- FirePath — database security hardening (step 1)
-- Run in Supabase → SQL Editor. Runs as one transaction: it either
-- all applies or none of it does. Undo: 001_security_hardening_undo.sql
--
-- What it fixes
--   1. Any logged-in user could set their own users.is_pro = true (free Pro).
--   2. Logged-out visitors (anon) held write/delete rights on user tables —
--      only row-level security stood in the way.
--   3. TRUNCATE (wipe a whole table, ignores RLS) was granted to everyone.
--   4. learning_articles had a public-read policy but no SELECT grant, so
--      personalised Learning Lab content could never load.
--
-- What the site needs (audited from the front-end code, Oct 2026)
--   anon:          INSERT feedback, SELECT learning_articles. Nothing else.
--   authenticated: SELECT own rows everywhere; INSERT own rows; upserts
--                  (INSERT … ON CONFLICT UPDATE) on calculations, fp_profiles,
--                  lab_progress, financial_learning_progress, users — so those
--                  keep UPDATE. users writes only id, email, persona.
--                  No DELETE or TRUNCATE anywhere.
-- Row-level security is already ON for every table with own-rows policies;
-- this narrows the grants underneath it (defence in depth).
-- ============================================================

begin;

-- 1. Nobody using the public API may wipe tables or alter triggers/keys.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- 2. Logged-out visitors: no access to anyone's personal or financial data.
revoke all on
  public.users, public.fp_profiles, public.calculations, public.checkins,
  public.financial_snapshots, public.lab_progress, public.financial_learning_progress
from anon;

-- …only sending feedback and reading the public articles.
revoke all on public.feedback from anon;
grant insert on public.feedback to anon;
grant select on public.learning_articles to anon, authenticated;

-- 3. Logged-in users: only what the site actually does.
revoke delete on public.users, public.calculations, public.checkins from authenticated;
revoke update on public.checkins from authenticated;          -- site only reads/inserts check-ins

-- users: may write id/email/persona only — never is_pro.
-- (PostgREST upserts SET every column sent, incl. id; RLS still pins id = auth.uid().)
revoke insert, update on public.users from authenticated;
grant insert (id, email, persona) on public.users to authenticated;
grant update (id, email, persona) on public.users to authenticated;

-- 4. Belt and braces: is_pro can only change via the Stripe webhook (service role)
--    or an admin in this SQL editor. API users are blocked even if a grant slips.
create or replace function public.guard_is_pro()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.is_pro := false;
    elsif new.is_pro is distinct from old.is_pro then
      raise exception 'is_pro can only be changed by billing' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_is_pro on public.users;
create trigger guard_is_pro
  before insert or update on public.users
  for each row execute function public.guard_is_pro();

commit;
