-- Launch tables for Cockpit, Vault notes, and Actions approvals.
-- Idempotent: safe to apply on environments where some tables already exist.

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null default '',
  tags text[] not null default '{}',
  symbol text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists notes_user_id_created_at_idx
  on public.notes (user_id, created_at desc);

alter table public.notes enable row level security;

drop policy if exists "notes_select_own" on public.notes;
create policy "notes_select_own"
  on public.notes for select
  using (auth.uid() = user_id);

drop policy if exists "notes_insert_own" on public.notes;
create policy "notes_insert_own"
  on public.notes for insert
  with check (auth.uid() = user_id);

drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own"
  on public.notes for update
  using (auth.uid() = user_id);

drop policy if exists "notes_delete_own" on public.notes;
create policy "notes_delete_own"
  on public.notes for delete
  using (auth.uid() = user_id);

create table if not exists public.execution_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  instrument text not null,
  symbol text,
  direction text check (direction in ('long', 'short', 'flat')),
  entry_price numeric,
  stop_loss numeric,
  take_profit numeric,
  risk_amount numeric,
  risk_percent numeric,
  rationale text,
  notes text,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists execution_requests_user_status_created_idx
  on public.execution_requests (user_id, status, created_at desc);

alter table public.execution_requests enable row level security;

drop policy if exists "execution_requests_select_own" on public.execution_requests;
create policy "execution_requests_select_own"
  on public.execution_requests for select
  using (auth.uid() = user_id);

drop policy if exists "execution_requests_insert_own" on public.execution_requests;
create policy "execution_requests_insert_own"
  on public.execution_requests for insert
  with check (auth.uid() = user_id);

drop policy if exists "execution_requests_update_own" on public.execution_requests;
create policy "execution_requests_update_own"
  on public.execution_requests for update
  using (auth.uid() = user_id);

create table if not exists public.setup_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  execution_request_id uuid references public.execution_requests (id) on delete set null,
  instrument text not null,
  direction text check (direction in ('long', 'short')),
  summary text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists setup_reviews_user_status_created_idx
  on public.setup_reviews (user_id, status, created_at desc);

alter table public.setup_reviews enable row level security;

drop policy if exists "setup_reviews_select_own" on public.setup_reviews;
create policy "setup_reviews_select_own"
  on public.setup_reviews for select
  using (auth.uid() = user_id);

drop policy if exists "setup_reviews_insert_own" on public.setup_reviews;
create policy "setup_reviews_insert_own"
  on public.setup_reviews for insert
  with check (auth.uid() = user_id);

drop policy if exists "setup_reviews_update_own" on public.setup_reviews;
create policy "setup_reviews_update_own"
  on public.setup_reviews for update
  using (auth.uid() = user_id);

create table if not exists public.assistant_learning_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  signal_type text not null,
  payload jsonb not null default '{}'::jsonb,
  related_message_id uuid,
  related_execution_request_id uuid references public.execution_requests (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists assistant_learning_signals_user_created_idx
  on public.assistant_learning_signals (user_id, created_at desc);

alter table public.assistant_learning_signals enable row level security;

drop policy if exists "assistant_learning_signals_select_own" on public.assistant_learning_signals;
create policy "assistant_learning_signals_select_own"
  on public.assistant_learning_signals for select
  using (auth.uid() = user_id);

drop policy if exists "assistant_learning_signals_insert_own" on public.assistant_learning_signals;
create policy "assistant_learning_signals_insert_own"
  on public.assistant_learning_signals for insert
  with check (auth.uid() = user_id);

create table if not exists public.assistant_learning_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  metric_key text not null,
  metric_value numeric,
  dimensions jsonb not null default '{}'::jsonb,
  period_start timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists assistant_learning_metrics_user_updated_idx
  on public.assistant_learning_metrics (user_id, updated_at desc);

alter table public.assistant_learning_metrics enable row level security;

drop policy if exists "assistant_learning_metrics_select_own" on public.assistant_learning_metrics;
create policy "assistant_learning_metrics_select_own"
  on public.assistant_learning_metrics for select
  using (auth.uid() = user_id);

drop policy if exists "assistant_learning_metrics_insert_own" on public.assistant_learning_metrics;
create policy "assistant_learning_metrics_insert_own"
  on public.assistant_learning_metrics for insert
  with check (auth.uid() = user_id);

drop policy if exists "assistant_learning_metrics_update_own" on public.assistant_learning_metrics;
create policy "assistant_learning_metrics_update_own"
  on public.assistant_learning_metrics for update
  using (auth.uid() = user_id);

create table if not exists public.assistant_cockpit_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  alignment_score numeric,
  learning_progress jsonb not null default '{}'::jsonb,
  confidence_trend jsonb not null default '[]'::jsonb,
  behavior_map jsonb not null default '{}'::jsonb,
  feedback_loop_stats jsonb not null default '{}'::jsonb,
  signal_count integer not null default 0,
  captured_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists assistant_cockpit_snapshots_user_captured_idx
  on public.assistant_cockpit_snapshots (user_id, captured_at desc);

alter table public.assistant_cockpit_snapshots enable row level security;

drop policy if exists "assistant_cockpit_snapshots_select_own" on public.assistant_cockpit_snapshots;
create policy "assistant_cockpit_snapshots_select_own"
  on public.assistant_cockpit_snapshots for select
  using (auth.uid() = user_id);

drop policy if exists "assistant_cockpit_snapshots_insert_own" on public.assistant_cockpit_snapshots;
create policy "assistant_cockpit_snapshots_insert_own"
  on public.assistant_cockpit_snapshots for insert
  with check (auth.uid() = user_id);
