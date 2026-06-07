-- ═══════════════════════════════════════════════════════════════════
-- AXE Intel: structured tables for persistent intel data
-- These replace the generic intel_external_snapshots blob cache with
-- properly typed, queryable tables for each intel feed.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Insider Trades (SEC EDGAR Form 4)
create table if not exists public.intel_insider_trades (
  id uuid default gen_random_uuid() primary key,
  ticker text not null,
  insider_name text not null,
  insider_role text,
  trade_type text not null check (trade_type in ('BUY', 'SELL')),
  shares integer,
  price_per_share numeric,
  total_value numeric not null default 0,
  trade_date date not null,
  filing_url text,
  created_at timestamptz not null default now()
);

-- Prevent duplicate rows (same insider + ticker + date + type)
create unique index if not exists intel_insider_trades_uniq
  on public.intel_insider_trades (ticker, insider_name, trade_date, trade_type);

create index if not exists intel_insider_trades_date_idx
  on public.intel_insider_trades (trade_date desc);

create index if not exists intel_insider_trades_ticker_idx
  on public.intel_insider_trades (ticker);

alter table public.intel_insider_trades enable row level security;

comment on table public.intel_insider_trades is
  'SEC EDGAR Form 4 insider transactions. Written by intel-proxy edge function (service role).';


-- 2. Congress Trades (Senate + House)
create table if not exists public.intel_congress_trades (
  id uuid default gen_random_uuid() primary key,
  politician text not null,
  chamber text not null default 'Senate',
  party text,
  ticker text not null,
  asset_description text,
  trade_type text not null check (trade_type in ('BUY', 'SELL')),
  amount_range text,            -- e.g. "$1,001 - $15,000"
  trade_date date not null,
  disclosure_date date,
  source text not null default 'quiver',   -- quiver / fmp / house_clerk
  created_at timestamptz not null default now()
);

create unique index if not exists intel_congress_trades_uniq
  on public.intel_congress_trades (politician, ticker, trade_date, trade_type, coalesce(amount_range, ''));

create index if not exists intel_congress_trades_date_idx
  on public.intel_congress_trades (trade_date desc);

create index if not exists intel_congress_trades_ticker_idx
  on public.intel_congress_trades (ticker);

alter table public.intel_congress_trades enable row level security;

comment on table public.intel_congress_trades is
  'US Congress stock trades. Sources: Quiver Quantitative (free API key), FMP (paid fallback). Written by intel-proxy.';


-- 3. Dark Pool Prints (volume anomaly snapshots)
create table if not exists public.intel_dark_pool (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  price numeric not null,
  block_size integer not null,
  notional numeric not null,
  side text check (side in ('buy', 'sell', 'neutral')),
  volume_ratio numeric,         -- today_vol / avg_vol
  snapshot_time timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists intel_dark_pool_time_idx
  on public.intel_dark_pool (snapshot_time desc);

create index if not exists intel_dark_pool_symbol_idx
  on public.intel_dark_pool (symbol);

alter table public.intel_dark_pool enable row level security;

comment on table public.intel_dark_pool is
  'Finnhub volume-anomaly based dark pool approximation snapshots. Written by intel-proxy.';


-- 4. Unusual Options (analyst momentum approximation)
create table if not exists public.intel_unusual_options (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  strike numeric not null,
  expiry date not null,
  volume integer not null,
  open_interest integer not null,
  side text not null check (side in ('CALL', 'PUT')),
  premium numeric not null,
  is_sweep boolean not null default false,
  rule text,
  snapshot_time timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists intel_unusual_options_time_idx
  on public.intel_unusual_options (snapshot_time desc);

alter table public.intel_unusual_options enable row level security;

comment on table public.intel_unusual_options is
  'Finnhub recommendation-trend based unusual options approximation. Written by intel-proxy.';


-- 5. Market Tide (aggregate sentiment)
create table if not exists public.intel_market_tide (
  id uuid default gen_random_uuid() primary key,
  net_call_premium numeric not null,
  net_put_premium numeric not null,
  call_put_ratio numeric not null,
  bias text not null check (bias in ('bullish', 'bearish', 'neutral')),
  snapshot_time timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists intel_market_tide_time_idx
  on public.intel_market_tide (snapshot_time desc);

alter table public.intel_market_tide enable row level security;

comment on table public.intel_market_tide is
  'Finnhub aggregate sentiment based market tide snapshots. Written by intel-proxy.';


-- 6. Sync metadata — tracks when each feed was last synced
create table if not exists public.intel_sync_log (
  feed_id text primary key,     -- insiderTrades, congressTrades, darkPool, unusualOptions, marketTide
  last_sync_at timestamptz not null default now(),
  rows_synced integer not null default 0,
  last_error text,
  source text                   -- provider used for this sync
);

alter table public.intel_sync_log enable row level security;

comment on table public.intel_sync_log is
  'Tracks last successful sync per intel feed. Used by intel-proxy to decide when to refresh from external APIs.';

-- Seed sync log entries
insert into public.intel_sync_log (feed_id, last_sync_at, rows_synced)
values
  ('insiderTrades',   '2000-01-01'::timestamptz, 0),
  ('congressTrades',  '2000-01-01'::timestamptz, 0),
  ('darkPool',        '2000-01-01'::timestamptz, 0),
  ('unusualOptions',  '2000-01-01'::timestamptz, 0),
  ('marketTide',      '2000-01-01'::timestamptz, 0)
on conflict (feed_id) do nothing;
