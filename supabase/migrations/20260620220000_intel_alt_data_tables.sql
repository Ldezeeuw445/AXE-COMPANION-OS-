-- Alt-data intel tables used by intel-proxy + intelClient DB fallback.

create table if not exists public.intel_corporate_jets (
  id uuid primary key default gen_random_uuid(),
  icao24 text not null,
  callsign text,
  company text,
  origin_country text,
  latitude numeric,
  longitude numeric,
  altitude numeric,
  velocity numeric,
  on_ground boolean not null default false,
  snapshot_time timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists intel_corporate_jets_time_idx
  on public.intel_corporate_jets (snapshot_time desc);

create index if not exists intel_corporate_jets_icao_idx
  on public.intel_corporate_jets (icao24);

alter table public.intel_corporate_jets enable row level security;

create table if not exists public.intel_vessel_tracking (
  id uuid primary key default gen_random_uuid(),
  mmsi text not null,
  vessel_name text,
  vessel_type text,
  latitude numeric,
  longitude numeric,
  speed numeric,
  course numeric,
  destination text,
  region text,
  snapshot_time timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists intel_vessel_tracking_time_idx
  on public.intel_vessel_tracking (snapshot_time desc);

create index if not exists intel_vessel_tracking_mmsi_idx
  on public.intel_vessel_tracking (mmsi);

alter table public.intel_vessel_tracking enable row level security;

create table if not exists public.intel_conflict_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  event_date date not null,
  country text not null,
  region text,
  event_type text not null,
  sub_event_type text,
  actor1 text,
  fatalities integer not null default 0,
  notes text,
  latitude numeric,
  longitude numeric,
  snapshot_time timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists intel_conflict_events_time_idx
  on public.intel_conflict_events (snapshot_time desc);

create index if not exists intel_conflict_events_event_idx
  on public.intel_conflict_events (event_id);

alter table public.intel_conflict_events enable row level security;

create table if not exists public.intel_energy_flows (
  id uuid primary key default gen_random_uuid(),
  series_id text not null,
  series_name text not null,
  period text not null,
  value numeric,
  unit text,
  snapshot_time timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists intel_energy_flows_time_idx
  on public.intel_energy_flows (snapshot_time desc);

alter table public.intel_energy_flows enable row level security;

create table if not exists public.intel_cyber_threats (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  classification text,
  name text,
  noise boolean not null default false,
  riot boolean not null default false,
  last_seen timestamptz,
  tags text[] not null default '{}'::text[],
  category text,
  snapshot_time timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists intel_cyber_threats_time_idx
  on public.intel_cyber_threats (snapshot_time desc);

alter table public.intel_cyber_threats enable row level security;

create table if not exists public.intel_military_radar (
  id uuid primary key default gen_random_uuid(),
  hex text not null,
  registration text,
  aircraft_type text,
  callsign text,
  altitude numeric,
  ground_speed numeric,
  latitude numeric,
  longitude numeric,
  on_ground boolean not null default false,
  category text,
  last_seen timestamptz,
  snapshot_time timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists intel_military_radar_time_idx
  on public.intel_military_radar (snapshot_time desc);

create index if not exists intel_military_radar_hex_idx
  on public.intel_military_radar (hex);

alter table public.intel_military_radar enable row level security;

create table if not exists public.intel_emergency_monitor (
  id uuid primary key default gen_random_uuid(),
  hex text not null,
  registration text,
  aircraft_type text,
  callsign text,
  squawk text,
  altitude numeric,
  ground_speed numeric,
  latitude numeric,
  longitude numeric,
  on_ground boolean not null default false,
  last_seen timestamptz,
  snapshot_time timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists intel_emergency_monitor_time_idx
  on public.intel_emergency_monitor (snapshot_time desc);

alter table public.intel_emergency_monitor enable row level security;

insert into public.intel_sync_log (feed_id, last_sync_at, rows_synced)
values
  ('corporateJets', '2000-01-01'::timestamptz, 0),
  ('vesselTracking', '2000-01-01'::timestamptz, 0),
  ('conflictEvents', '2000-01-01'::timestamptz, 0),
  ('energyFlows', '2000-01-01'::timestamptz, 0),
  ('cyberThreats', '2000-01-01'::timestamptz, 0),
  ('militaryRadar', '2000-01-01'::timestamptz, 0),
  ('emergencyMonitor', '2000-01-01'::timestamptz, 0)
on conflict (feed_id) do nothing;
