-- Undo 004: let browsers insert feedback directly again (as on 8 Oct 2026).
grant insert on public.feedback to anon, authenticated;
create policy "Allow insert feedback" on public.feedback for insert to public with check (true);
