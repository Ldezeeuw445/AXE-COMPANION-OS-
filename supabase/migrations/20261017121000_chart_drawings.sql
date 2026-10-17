-- Durable chart drawings / annotations for AXE Companion.
-- MUST be applied to project pqnngpcgbdwxavbatbia before deploy.
-- Do not skip this migration: the app upserts into public.chart_drawings.

create table if not exists public.chart_drawings (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null check (char_length(btrim(symbol)) > 0),
  timeframe text,
  drawing jsonb not null default '{}'::jsonb,
  tool_type text not null check (char_length(btrim(tool_type)) > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted boolean not null default false
);

comment on table public.chart_drawings is
  'User chart drawings/annotations. Local-first; synced from the signed-in client. Soft-delete via deleted flag.';

comment on column public.chart_drawings.drawing is
  'Full ChartAnnotation payload (points, settings, timestamps).';

comment on column public.chart_drawings.tool_type is
  'Annotation tool: fib_retracement, trendline, rectangle, text, horizontal_level, order_block, fvg.';

comment on column public.chart_drawings.deleted is
  'Soft-delete tombstone so last-write-wins sync can propagate removals across devices.';

comment on column public.chart_drawings.timeframe is
  'Chart timeframe key (h1, m15, …). Null when the drawing is not tied to a single timeframe.';

create index if not exists chart_drawings_user_id_symbol_idx
  on public.chart_drawings (user_id, symbol);

alter table public.chart_drawings enable row level security;

-- Authenticated users may only touch their own rows. Anon has no policies
-- and is explicitly revoked below — no anonymous access.
drop policy if exists "chart_drawings_select_own" on public.chart_drawings;
create policy "chart_drawings_select_own"
  on public.chart_drawings
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "chart_drawings_insert_own" on public.chart_drawings;
create policy "chart_drawings_insert_own"
  on public.chart_drawings
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "chart_drawings_update_own" on public.chart_drawings;
create policy "chart_drawings_update_own"
  on public.chart_drawings
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "chart_drawings_delete_own" on public.chart_drawings;
create policy "chart_drawings_delete_own"
  on public.chart_drawings
  for delete
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.chart_drawings from public;
revoke all on table public.chart_drawings from anon;
grant select, insert, update, delete on table public.chart_drawings to authenticated;
grant all on table public.chart_drawings to service_role;
