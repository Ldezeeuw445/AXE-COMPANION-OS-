-- Persistent audit snapshots of the chart live stream.
-- One row per (user, account, symbol, timeframe) — upsert keeps it small.
-- Apply via Supabase CLI or SQL editor.

create table if not exists public.chart_live_snapshots (
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null,
  display_symbol text not null,
  broker_symbol text not null,
  timeframe text not null,
  last_price numeric,
  last_bid numeric,
  last_ask numeric,
  last_tick_at timestamptz,
  last_candle_at timestamptz,
  last_candle jsonb,
  open_positions_count integer,
  open_positions jsonb,
  status text,
  source text not null default 'metaapi_mt5',
  updated_at timestamptz not null default now(),
  primary key (user_id, account_id, display_symbol, timeframe)
);

create index if not exists chart_live_snapshots_account_idx
  on public.chart_live_snapshots (account_id);

alter table public.chart_live_snapshots enable row level security;

create policy "chart_live_snapshots_select_own"
  on public.chart_live_snapshots for select
  using (auth.uid() = user_id);

create policy "chart_live_snapshots_insert_own"
  on public.chart_live_snapshots for insert
  with check (auth.uid() = user_id);

create policy "chart_live_snapshots_update_own"
  on public.chart_live_snapshots for update
  using (auth.uid() = user_id);

create policy "chart_live_snapshots_delete_own"
  on public.chart_live_snapshots for delete
  using (auth.uid() = user_id);
