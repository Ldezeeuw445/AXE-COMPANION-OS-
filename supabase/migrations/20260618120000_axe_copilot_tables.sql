-- AXE co-pilot: server-side chart action queue + proactive event dedup

create table if not exists public.axe_pending_chart_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action_type text not null,
  symbol text not null,
  timeframe text not null default 'h1',
  account_id uuid references public.user_broker_accounts (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  consumed_at timestamptz
);

create index if not exists axe_pending_chart_actions_user_status_idx
  on public.axe_pending_chart_actions (user_id, status, created_at desc);

alter table public.axe_pending_chart_actions enable row level security;

drop policy if exists "axe_pending_chart_actions_select_own" on public.axe_pending_chart_actions;
create policy "axe_pending_chart_actions_select_own"
  on public.axe_pending_chart_actions for select
  using (auth.uid() = user_id);

drop policy if exists "axe_pending_chart_actions_insert_own" on public.axe_pending_chart_actions;
create policy "axe_pending_chart_actions_insert_own"
  on public.axe_pending_chart_actions for insert
  with check (auth.uid() = user_id);

drop policy if exists "axe_pending_chart_actions_update_own" on public.axe_pending_chart_actions;
create policy "axe_pending_chart_actions_update_own"
  on public.axe_pending_chart_actions for update
  using (auth.uid() = user_id);

create table if not exists public.axe_proactive_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_key text not null,
  title text not null,
  body text not null default '',
  url text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, event_key)
);

create index if not exists axe_proactive_events_user_created_idx
  on public.axe_proactive_events (user_id, created_at desc);

alter table public.axe_proactive_events enable row level security;

drop policy if exists "axe_proactive_events_select_own" on public.axe_proactive_events;
create policy "axe_proactive_events_select_own"
  on public.axe_proactive_events for select
  using (auth.uid() = user_id);
