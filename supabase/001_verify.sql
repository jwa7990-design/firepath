-- ============================================================
-- Verify 001_security_hardening.sql — run AFTER the hardening.
-- Each test pretends to be a real logged-in user (or a logged-out visitor)
-- inside a transaction that is rolled back, so nothing is changed.
-- Run the tests one at a time (highlight a block, then Run).
-- ============================================================


-- TEST 1 — a logged-in user tries to give themselves Pro.
-- EXPECT: an ERROR ("permission denied for table users" or
--         "is_pro can only be changed by billing"). An error = PASS.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id::text from public.users limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
update public.users set is_pro = true where id = auth.uid();
rollback;


-- TEST 2 — the same user saves their knowledge level, exactly the way the
-- website does it (an upsert of id, email, persona).
-- EXPECT: success ("INSERT 0 1"). Success = PASS.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id::text from public.users limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.users (id, email, persona)
  values (auth.uid(), (select email from public.users where id = auth.uid()), 'building')
  on conflict (id) do update set id = excluded.id, email = excluded.email, persona = excluded.persona;
rollback;


-- TEST 3 — a logged-out visitor tries to read financial profiles.
-- EXPECT: ERROR "permission denied for table fp_profiles". An error = PASS.
begin;
set local role anon;
select count(*) from public.fp_profiles;
rollback;


-- TEST 4 — a logged-in user can only see their own profile, not others'.
-- EXPECT: a single row with visible_profiles = 0 or 1. Anything higher = FAIL.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id::text from public.users limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) as visible_profiles from public.fp_profiles;
rollback;


-- TEST 5 — Learning Lab articles are readable (this was broken before).
-- EXPECT: a number greater than 0. A number = PASS.
begin;
set local role anon;
select count(*) as articles from public.learning_articles;
rollback;
