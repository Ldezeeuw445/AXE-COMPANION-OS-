-- Saved alerts for AXE Companion (price, risk, news, macro, journal reminders).
-- Apply via Supabase CLI or SQL editor; RLS restricts rows to owner.

create table if not exists public.user_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text,
  type text not null,
  condition text,
  threshold numeric,
  keyword text,
  status text not null default 'active',
  triggered_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists user_alerts_user_id_created_idx
  on public.user_alerts (user_id, created_at desc);

alter table public.user_alerts enable row level security;

create policy "user_alerts_select_own"
  on public.user_alerts for select
  using (auth.uid() = user_id);

create policy "user_alerts_insert_own"
  on public.user_alerts for insert
  with check (auth.uid() = user_id);

create policy "user_alerts_update_own"
  on public.user_alerts for update
  using (auth.uid() = user_id);

create policy "user_alerts_delete_own"
  on public.user_alerts for delete
  using (auth.uid() = user_id);
