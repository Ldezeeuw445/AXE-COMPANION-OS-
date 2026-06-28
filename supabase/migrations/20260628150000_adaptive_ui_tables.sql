-- Adaptive UI tables (events, profiles, suggestions)
-- Safe to re-run on partially migrated deployments.

create table if not exists public.adaptive_ui_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid null references public.user_broker_accounts(id) on delete set null,
  event_type text not null,
  route text not null,
  session_id text null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists adaptive_ui_events_user_time_idx
  on public.adaptive_ui_events (user_id, occurred_at desc);

create index if not exists adaptive_ui_events_account_time_idx
  on public.adaptive_ui_events (account_id, occurred_at desc);

create index if not exists adaptive_ui_events_type_time_idx
  on public.adaptive_ui_events (event_type, occurred_at desc);

create table if not exists public.adaptive_ui_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.adaptive_ui_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid null references public.user_broker_accounts(id) on delete set null,
  kind text not null,
  status text not null check (status in ('pending', 'accepted', 'dismissed', 'expired')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null
);

create index if not exists adaptive_ui_suggestions_user_status_idx
  on public.adaptive_ui_suggestions (user_id, status, created_at desc);

alter table public.adaptive_ui_events enable row level security;
alter table public.adaptive_ui_profiles enable row level security;
alter table public.adaptive_ui_suggestions enable row level security;

drop policy if exists "adaptive_ui_events_select_own" on public.adaptive_ui_events;
create policy "adaptive_ui_events_select_own"
  on public.adaptive_ui_events for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "adaptive_ui_events_insert_own" on public.adaptive_ui_events;
create policy "adaptive_ui_events_insert_own"
  on public.adaptive_ui_events for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "adaptive_ui_profiles_select_own" on public.adaptive_ui_profiles;
create policy "adaptive_ui_profiles_select_own"
  on public.adaptive_ui_profiles for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "adaptive_ui_profiles_upsert_own" on public.adaptive_ui_profiles;
create policy "adaptive_ui_profiles_upsert_own"
  on public.adaptive_ui_profiles for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "adaptive_ui_suggestions_select_own" on public.adaptive_ui_suggestions;
create policy "adaptive_ui_suggestions_select_own"
  on public.adaptive_ui_suggestions for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "adaptive_ui_suggestions_insert_own" on public.adaptive_ui_suggestions;
create policy "adaptive_ui_suggestions_insert_own"
  on public.adaptive_ui_suggestions for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "adaptive_ui_suggestions_update_own" on public.adaptive_ui_suggestions;
create policy "adaptive_ui_suggestions_update_own"
  on public.adaptive_ui_suggestions for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
