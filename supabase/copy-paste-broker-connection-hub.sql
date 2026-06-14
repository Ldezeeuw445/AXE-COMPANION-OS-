-- Broker Connection Hub — Supabase foundation for multi-broker (MT5, Alpaca, IBKR).
-- Wires schema from https://github.com/Ldezeeuw445/broker-connection-hub
-- Frontend unchanged; MT5 MetaApi path keeps working. Alpaca/IBKR rows are catalog-ready.

-- ---------------------------------------------------------------------------
-- Provider catalog (static definitions — mirrors hub contract BrokerAdapter)
-- ---------------------------------------------------------------------------
create table if not exists public.broker_providers (
  id text primary key,
  display_name text not null,
  description text not null,
  provider_key text not null,
  connection_methods text[] not null default '{}',
  supported_modes text[] not null default '{live}',
  catalog jsonb not null default '{}'::jsonb,
  enabled boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.broker_providers is
  'Broker Connection Hub catalog. enabled=true means server adapters may accept connects.';

insert into public.broker_providers (id, display_name, description, provider_key, connection_methods, supported_modes, enabled, sort_order, catalog)
values
  (
    'mt5-style',
    'MT5 (MetaApi Cloud)',
    'MetaTrader 5 via MetaApi cloud — forex & CFD. Login, server, investor or master password.',
    'mt5',
    array['cloud_mt5', 'cloud_mt5_disconnected'],
    array['live', 'readonly'],
    true,
    10,
    '{"marketData":{"supportsQuotes":true,"supportsDepth":true,"supportsHistoricalBars":true,"defaultTier":"realtime"},"execution":{"supportsMarketOrders":true,"supportsLimitOrders":true,"supportsStopOrders":true}}'::jsonb
  ),
  (
    'axe-demo',
    'AXE Demo Account',
    'Virtual paper account — no broker credentials required.',
    'demo',
    array['demo_paper'],
    array['paper'],
    true,
    5,
    '{"marketData":{"supportsQuotes":true,"supportsHistoricalBars":true,"defaultTier":"realtime"},"execution":{"supportsMarketOrders":true,"supportsLimitOrders":true}}'::jsonb
  ),
  (
    'alpaca-style',
    'Alpaca',
    'US equities REST + streaming. Paper and live environments.',
    'alpaca',
    array['cloud_alpaca'],
    array['paper', 'live', 'readonly'],
    false,
    20,
    '{"marketData":{"supportsQuotes":true,"supportsHistoricalBars":true,"defaultTier":"realtime","entitlementsRequired":["us_equity"]},"execution":{"supportsMarketOrders":true,"supportsLimitOrders":true,"supportsBracketOrders":true,"supportsFractionalShares":true}}'::jsonb
  ),
  (
    'ibkr-style',
    'Interactive Brokers',
    'IBKR Gateway/TWS session with professional market-data entitlements.',
    'ibkr',
    array['cloud_ibkr'],
    array['paper', 'live', 'readonly'],
    false,
    30,
    '{"marketData":{"supportsQuotes":true,"supportsDepth":true,"supportsHistoricalBars":true,"defaultTier":"professional","entitlementsRequired":["us_stocks","forex"]},"execution":{"supportsMarketOrders":true,"supportsLimitOrders":true,"supportsStopOrders":true,"supportsBracketOrders":true}}'::jsonb
  )
on conflict (id) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  provider_key = excluded.provider_key,
  connection_methods = excluded.connection_methods,
  supported_modes = excluded.supported_modes,
  catalog = excluded.catalog,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Hub fields on existing broker accounts (backward compatible)
-- ---------------------------------------------------------------------------
alter table public.user_broker_accounts
  add column if not exists hub_broker_id text,
  add column if not exists trading_mode text default 'live',
  add column if not exists hub_status text,
  add column if not exists hub_permissions jsonb default '{}'::jsonb;

comment on column public.user_broker_accounts.hub_broker_id is
  'Broker Connection Hub provider id (mt5-style, alpaca-style, ibkr-style, axe-demo).';
comment on column public.user_broker_accounts.trading_mode is
  'Hub trading mode: paper | live | readonly';
comment on column public.user_broker_accounts.hub_status is
  'Hub connection status snapshot: connected | connecting | disconnected | degraded | error';
comment on column public.user_broker_accounts.hub_permissions is
  'Serialized BrokerPermissionState from broker-connection-hub contract';

-- Widen connection_method for future brokers + disconnected MT5 state
alter table public.user_broker_accounts
  drop constraint if exists user_broker_accounts_connection_method_check;

alter table public.user_broker_accounts
  add constraint user_broker_accounts_connection_method_check
  check (
    connection_method = any (
      array[
        'cloud_mt5'::text,
        'cloud_mt5_disconnected'::text,
        'local_bridge'::text,
        'demo_paper'::text,
        'cloud_alpaca'::text,
        'cloud_ibkr'::text
      ]
    )
  );

comment on column public.user_broker_accounts.connection_method is
  'cloud_mt5, cloud_alpaca, cloud_ibkr, demo_paper, local_bridge (legacy), cloud_mt5_disconnected';

-- Backfill hub columns from existing MT5 / demo rows
update public.user_broker_accounts
set
  hub_broker_id = coalesce(hub_broker_id, 'mt5-style'),
  trading_mode = coalesce(
    trading_mode,
    case
      when (metadata->>'passwordType') = 'investor' then 'readonly'
      else 'live'
    end
  ),
  hub_status = coalesce(
    hub_status,
    case
      when provider_status in ('connected', 'provisioned') then 'connected'
      when provider_status in ('provisioning', 'connecting', 'syncing', 'recovering') then 'connecting'
      when provider_status in ('disconnected', 'orphaned') then 'disconnected'
      when provider_status in ('sync_failed', 'recovery_failed', 'invalid_credentials', 'failed') then 'error'
      else 'connecting'
    end
  )
where provider = 'mt5' and hub_broker_id is null;

update public.user_broker_accounts
set
  hub_broker_id = coalesce(hub_broker_id, 'axe-demo'),
  trading_mode = coalesce(trading_mode, 'paper'),
  hub_status = coalesce(hub_status, 'connected')
where provider = 'demo' or connection_method = 'demo_paper';

create index if not exists user_broker_accounts_hub_broker_id_idx
  on public.user_broker_accounts (hub_broker_id);

-- ---------------------------------------------------------------------------
-- Symbol mappings (hub contract; MT5 symbol_map may still live in metadata)
-- ---------------------------------------------------------------------------
create table if not exists public.broker_symbol_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null,
  canonical_symbol text not null,
  broker_symbol text not null,
  asset_class text not null default 'other',
  exchange text,
  multiplier numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, canonical_symbol)
);

create index if not exists broker_symbol_mappings_account_id_idx
  on public.broker_symbol_mappings (account_id);

alter table public.broker_symbol_mappings enable row level security;

create policy "broker_symbol_mappings_select_own"
  on public.broker_symbol_mappings for select
  using (auth.uid() = user_id);

create policy "broker_symbol_mappings_insert_own"
  on public.broker_symbol_mappings for insert
  with check (auth.uid() = user_id);

create policy "broker_symbol_mappings_update_own"
  on public.broker_symbol_mappings for update
  using (auth.uid() = user_id);

create policy "broker_symbol_mappings_delete_own"
  on public.broker_symbol_mappings for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Credential vault pointers (never store raw secrets in plaintext)
-- ---------------------------------------------------------------------------
create table if not exists public.broker_connection_secrets (
  account_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  vault_provider text not null default 'server',
  vault_key text,
  has_credentials boolean not null default false,
  credential_hints jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.broker_connection_secrets enable row level security;

create policy "broker_connection_secrets_select_own"
  on public.broker_connection_secrets for select
  using (auth.uid() = user_id);

create policy "broker_connection_secrets_insert_own"
  on public.broker_connection_secrets for insert
  with check (auth.uid() = user_id);

create policy "broker_connection_secrets_update_own"
  on public.broker_connection_secrets for update
  using (auth.uid() = user_id);

create policy "broker_connection_secrets_delete_own"
  on public.broker_connection_secrets for delete
  using (auth.uid() = user_id);

-- broker_providers is read-only for authenticated users (catalog)
alter table public.broker_providers enable row level security;

create policy "broker_providers_select_authenticated"
  on public.broker_providers for select
  to authenticated
  using (true);
