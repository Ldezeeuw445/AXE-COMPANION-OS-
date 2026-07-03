-- AXE Engine profile + run history
-- Persists confidence gating state so AXE guidance stays stable and traceable.

create table if not exists public.axe_engine_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  engine_name text not null default 'AXE One',
  engine_version text not null default 'v1',
  confidence_score integer not null default 0 check (confidence_score >= 0 and confidence_score <= 100),
  confidence_tier text not null default 'low' check (confidence_tier in ('low', 'medium', 'high')),
  gate_mode text not null default 'strict' check (gate_mode in ('strict', 'guided', 'proactive')),
  alignment_score numeric(6,3) not null default 0,
  signal_count integer not null default 0,
  trade_label_count integer not null default 0,
  memory_count integer not null default 0,
  snapshot_captured_at timestamptz null,
  rationale jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.axe_engine_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  status text not null default 'ok' check (status in ('ok', 'error')),
  latency_ms integer null,
  confidence_score integer null check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 100)),
  confidence_tier text null check (confidence_tier is null or confidence_tier in ('low', 'medium', 'high')),
  gate_mode text null check (gate_mode is null or gate_mode in ('strict', 'guided', 'proactive')),
  details jsonb not null default '{}'::jsonb,
  error text null,
  created_at timestamptz not null default now()
);

create index if not exists axe_engine_runs_user_created_idx
  on public.axe_engine_runs (user_id, created_at desc);

alter table public.axe_engine_profiles enable row level security;
alter table public.axe_engine_runs enable row level security;

drop policy if exists "axe_engine_profiles_select_own" on public.axe_engine_profiles;
create policy "axe_engine_profiles_select_own"
  on public.axe_engine_profiles for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "axe_engine_profiles_upsert_own" on public.axe_engine_profiles;
create policy "axe_engine_profiles_upsert_own"
  on public.axe_engine_profiles for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "axe_engine_runs_select_own" on public.axe_engine_runs;
create policy "axe_engine_runs_select_own"
  on public.axe_engine_runs for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "axe_engine_runs_insert_own" on public.axe_engine_runs;
create policy "axe_engine_runs_insert_own"
  on public.axe_engine_runs for insert to authenticated
  with check (auth.uid() = user_id);
