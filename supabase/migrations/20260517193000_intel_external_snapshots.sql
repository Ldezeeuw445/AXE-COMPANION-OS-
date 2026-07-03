-- AXE Companion: cache table used by the live intel-proxy Edge Function.
-- Service role writes snapshots; browser clients do not need direct access.

create table if not exists public.intel_external_snapshots (
  feed_id text primary key,
  url text not null,
  label text,
  body text not null default '',
  content_type text not null default 'text/plain',
  interval_minutes integer not null default 30,
  fetched_at timestamptz not null default now(),
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.intel_external_snapshots enable row level security;

create index if not exists intel_external_snapshots_updated_at_idx
  on public.intel_external_snapshots (updated_at desc);

comment on table public.intel_external_snapshots is
  'Server-side cache for AXE Intel external feed snapshots written by intel-proxy.';
