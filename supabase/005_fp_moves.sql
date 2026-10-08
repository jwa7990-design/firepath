-- 005 — fp_moves: each Pro member's status for each option ("move") from js/moves.js.
-- One row per (person, move). Status: doing ("On it"), done, dismissed ("Not for me").
-- Written by the site through the Worker (Pro only) as an upsert on (user_id, move_id).
-- Undo: drop table public.fp_moves;

create table if not exists public.fp_moves (
  user_id uuid not null references auth.users(id) on delete cascade,
  move_id text not null check (char_length(move_id) between 1 and 64),
  status text not null check (status in ('doing', 'done', 'dismissed')),
  done_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, move_id)
);
alter table public.fp_moves enable row level security;
create policy "Users can view own moves" on public.fp_moves for select to authenticated using (auth.uid() = user_id);
create policy "Users can insert own moves" on public.fp_moves for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own moves" on public.fp_moves for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.fp_moves from anon, authenticated;
grant select, insert, update on public.fp_moves to authenticated;
grant select, insert, update, delete on public.fp_moves to service_role;

-- Check: fp_moves | true
select relname, relrowsecurity from pg_class where relname = 'fp_moves';
