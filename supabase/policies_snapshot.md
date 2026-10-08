# Supabase access rules — snapshot

Captured 8 Oct 2026 from `pg_policies` and `pg_class.relrowsecurity` (run in the
Supabase SQL Editor). Re-capture after any change in the dashboard and update this
file, so the rules are tracked alongside the code.

Row-level security is **on** for every table: calculations, checkins, feedback,
financial_learning_progress, financial_snapshots, fp_profiles, lab_progress,
learning_articles, users.

| table | rule | command | roles | using | with check |
|---|---|---|---|---|---|
| calculations | Users can insert own calculations | INSERT | public | – | auth.uid() = user_id |
| calculations | Users can view own calculations | SELECT | public | auth.uid() = user_id | – |
| checkins | Users can insert own checkins | INSERT | public | – | auth.uid() = user_id |
| checkins | Users can view own checkins | SELECT | public | auth.uid() = user_id | – |
| feedback | Allow insert feedback (removed by 004) | INSERT | public | – | true |
| financial_learning_progress | Users can insert their own learning progress | INSERT | public | – | auth.uid() = user_id |
| financial_learning_progress | Users can view their own learning progress | SELECT | public | auth.uid() = user_id | – |
| financial_learning_progress | Users can update their own learning progress | UPDATE | public | auth.uid() = user_id | – |
| financial_snapshots | Users can insert their own snapshots | INSERT | public | – | auth.uid() = user_id |
| financial_snapshots | Users can view their own snapshots | SELECT | public | auth.uid() = user_id | – |
| fp_profiles | Users can insert own profile | INSERT | public | – | auth.uid() = id |
| fp_profiles | Users can read own profile | SELECT | public | auth.uid() = id | – |
| fp_profiles | Users can update own profile | UPDATE | public | auth.uid() = id | – |
| lab_progress | Users can insert own lab progress | INSERT | public | – | auth.uid() = user_id |
| lab_progress | Users can view own lab progress | SELECT | public | auth.uid() = user_id | – |
| lab_progress | users can update own lab progress | UPDATE | public | auth.uid() = user_id | auth.uid() = user_id |
| learning_articles | Public read access for learning_articles | SELECT | public | true | – |
| users | Users can insert own data | INSERT | authenticated | – | auth.uid() = id |
| users | Users can view own data | SELECT | authenticated | auth.uid() = id | – |
| users | Users can update own data | UPDATE | authenticated | auth.uid() = id | – |

Notes
- UPDATE rules without a "with check" reuse the "using" condition for the new row,
  so nobody can move a row to another person's id.
- No DELETE rules: people can't delete rows directly. Account deletion runs in the
  Worker with the service key (`POST /account/delete`).
- Column grants (001) limit what signed-in people can write on `users` to id, email
  and persona, so nobody can set `is_pro` on themselves.
- Pro-only tables (checkins, snapshots, lab_progress, calculations,
  financial_learning_progress) accept a person's own rows even without Pro at the
  database level; the Worker enforces Pro for those writes. Low risk (own data only).
- The `learn_lab` table doesn't exist; the Worker no longer allows it.
