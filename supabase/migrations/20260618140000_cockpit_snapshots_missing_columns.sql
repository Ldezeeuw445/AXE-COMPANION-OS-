-- Fix partial cockpit schema when assistant_cockpit_snapshots was created without signal_count/created_at

alter table public.assistant_cockpit_snapshots
  add column if not exists signal_count integer not null default 0;

alter table public.assistant_cockpit_snapshots
  add column if not exists created_at timestamptz not null default timezone('utc', now());
