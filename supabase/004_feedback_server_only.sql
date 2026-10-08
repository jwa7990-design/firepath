-- 004 — Feedback can only be saved through the FirePath server (Worker).
--
-- Before: anyone could insert feedback rows straight into the database with the
-- public anon key, skipping the Worker's spam checks and rate limit, and could set
-- any user_id. Now the Worker writes feedback with the service key (deployed first),
-- and browsers can't insert feedback directly at all.
--
-- Run AFTER the Worker version that saves feedback with the service key is live,
-- or the feedback form will stop working. Undo: 004_feedback_server_only_undo.sql

revoke insert on public.feedback from anon, authenticated;
drop policy if exists "Allow insert feedback" on public.feedback;

-- Check: should return no rows.
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'feedback' and grantee in ('anon', 'authenticated');
