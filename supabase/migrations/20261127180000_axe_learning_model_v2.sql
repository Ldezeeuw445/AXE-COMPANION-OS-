-- AXE learning model v2: explainable state per user, plus the user's own
-- corrections/resets/hides. Written by the Companion learning job
-- (service role); read by Companion and Trading OS under RLS.
-- NOT applied automatically: needs Luka's yes.

create table if not exists public.axe_learning_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  captured_at timestamptz not null default now(),
  model_version smallint not null,
  status text not null check (status in ('learning', 'scored')),
  score smallint check (score is null or (score between 0 and 100)),
  confidence text not null check (confidence in ('insufficient', 'low', 'medium', 'high')),
  data_points integer not null default 0,
  required_points integer not null default 0,
  state jsonb not null default '{}'::jsonb,
  changes jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  -- A scored snapshot must carry its score; a learning one must not.
  constraint axe_learning_snapshots_score_matches_status
    check ((status = 'scored') = (score is not null))
);

create index if not exists axe_learning_snapshots_user_captured_idx
  on public.axe_learning_snapshots (user_id, captured_at desc);

alter table public.axe_learning_snapshots enable row level security;

drop policy if exists axe_learning_snapshots_select_own on public.axe_learning_snapshots;
create policy axe_learning_snapshots_select_own
  on public.axe_learning_snapshots for select
  to authenticated
  using (user_id = auth.uid());

create table if not exists public.axe_learning_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null check (char_length(item_key) between 1 and 80),
  action text not null check (action in ('correct', 'reset', 'hide')),
  value text check (value is null or char_length(value) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists axe_learning_overrides_user_idx
  on public.axe_learning_overrides (user_id, created_at desc);

alter table public.axe_learning_overrides enable row level security;

drop policy if exists axe_learning_overrides_select_own on public.axe_learning_overrides;
create policy axe_learning_overrides_select_own
  on public.axe_learning_overrides for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists axe_learning_overrides_insert_own on public.axe_learning_overrides;
create policy axe_learning_overrides_insert_own
  on public.axe_learning_overrides for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists axe_learning_overrides_delete_own on public.axe_learning_overrides;
create policy axe_learning_overrides_delete_own
  on public.axe_learning_overrides for delete
  to authenticated
  using (user_id = auth.uid());

comment on table public.axe_learning_snapshots is
  'AXE learning model v2 state per user (components, learned items, unknowns, weekly change log, 12-week history). No smoothing, no volume bonus; score null while learning.';
comment on table public.axe_learning_overrides is
  'User corrections to what AXE learned: correct (set value), reset (forget events before created_at), hide (drop item). Latest per item_key wins.';
