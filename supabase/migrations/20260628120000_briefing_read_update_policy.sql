-- Briefing writes are performed by the service role (cron + API).
-- Users may mark weekly briefs as read (read_at only).

drop policy if exists "axe_daily_briefings_update_read_own" on public.axe_daily_briefings;
create policy "axe_daily_briefings_update_read_own"
  on public.axe_daily_briefings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
