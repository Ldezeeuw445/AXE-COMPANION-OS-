-- FINRA daily short sale volume (CNMS Reg SHO). Written by intel-proxy (service role).
create table if not exists public.intel_short_volume (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  trade_date date not null,
  short_volume bigint not null default 0,
  short_exempt_volume bigint not null default 0,
  total_volume bigint not null default 0,
  short_ratio numeric,
  market text not null default 'CNMS',
  created_at timestamptz not null default now()
);

create unique index if not exists intel_short_volume_uniq
  on public.intel_short_volume (symbol, trade_date, market);

create index if not exists intel_short_volume_date_idx
  on public.intel_short_volume (trade_date desc);

create index if not exists intel_short_volume_symbol_idx
  on public.intel_short_volume (symbol);

alter table public.intel_short_volume enable row level security;

comment on table public.intel_short_volume is
  'FINRA daily short sale volume (CNMS). Free CDN source — no Unusual Whales required.';

-- Authenticated users may read; writes stay on the intel-proxy service role.
do $$ begin
  create policy intel_short_volume_select_authenticated
    on public.intel_short_volume
    for select
    to authenticated
    using (true);
exception when duplicate_object then null;
end $$;

insert into public.intel_sync_log (feed_id, last_sync_at, rows_synced)
values ('shortVolume', '2000-01-01'::timestamptz, 0)
on conflict (feed_id) do nothing;
