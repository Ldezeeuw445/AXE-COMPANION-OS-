-- Runtime integration foundation
-- Safe to run on partially migrated runtime deployments.

create extension if not exists vector;

alter table public.user_broker_accounts
  add column if not exists metadata jsonb not null default '{}'::jsonb;

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
        'alpaca_paper_byo'::text,
        'alpaca_live'::text,
        'cloud_ibkr'::text,
        'ibkr_gateway_paper'::text,
        'ibkr_gateway_live'::text
      ]
    )
  );

comment on column public.user_broker_accounts.connection_method is
  'cloud_mt5, cloud_mt5_disconnected, local_bridge, demo_paper, cloud_alpaca, alpaca_paper_byo, alpaca_live, cloud_ibkr, ibkr_gateway_paper, ibkr_gateway_live';

insert into public.broker_providers (
  id,
  display_name,
  description,
  provider_key,
  connection_methods,
  supported_modes,
  enabled,
  sort_order,
  catalog
)
values
  (
    'alpaca-style',
    'Alpaca',
    'US equities REST + streaming. Paper and live environments.',
    'alpaca',
    array['cloud_alpaca', 'alpaca_paper_byo', 'alpaca_live'],
    array['paper', 'live', 'readonly'],
    true,
    20,
    '{"marketData":{"supportsQuotes":true,"supportsHistoricalBars":true,"defaultTier":"realtime","entitlementsRequired":["us_equity"]},"execution":{"supportsMarketOrders":true,"supportsLimitOrders":true,"supportsStopOrders":true,"supportsBracketOrders":true,"supportsFractionalShares":true}}'::jsonb
  ),
  (
    'ibkr-style',
    'Interactive Brokers',
    'IBKR Gateway/TWS session with professional market-data entitlements.',
    'ibkr',
    array['cloud_ibkr', 'ibkr_gateway_paper', 'ibkr_gateway_live'],
    array['paper', 'live', 'readonly'],
    true,
    30,
    '{"marketData":{"supportsQuotes":true,"supportsDepth":true,"supportsHistoricalBars":true,"defaultTier":"professional","entitlementsRequired":["us_stocks","forex"]},"execution":{"supportsMarketOrders":true,"supportsLimitOrders":true,"supportsStopOrders":true,"supportsBracketOrders":true}}'::jsonb
  )
on conflict (id) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  provider_key = excluded.provider_key,
  connection_methods = excluded.connection_methods,
  supported_modes = excluded.supported_modes,
  enabled = excluded.enabled,
  sort_order = excluded.sort_order,
  catalog = excluded.catalog,
  updated_at = now();

create table if not exists public.adaptive_ui_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid null references public.user_broker_accounts(id) on delete set null,
  event_type text not null,
  route text not null,
  session_id text null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists adaptive_ui_events_user_time_idx
  on public.adaptive_ui_events (user_id, occurred_at desc);

create index if not exists adaptive_ui_events_account_time_idx
  on public.adaptive_ui_events (account_id, occurred_at desc);

create index if not exists adaptive_ui_events_type_time_idx
  on public.adaptive_ui_events (event_type, occurred_at desc);

create table if not exists public.adaptive_ui_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.adaptive_ui_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid null references public.user_broker_accounts(id) on delete set null,
  kind text not null,
  status text not null check (status in ('pending', 'accepted', 'dismissed', 'expired')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null
);

create index if not exists adaptive_ui_suggestions_user_status_idx
  on public.adaptive_ui_suggestions (user_id, status, created_at desc);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'adaptive_ui_events'
      and column_name = 'account_id'
  ) then
    alter table public.adaptive_ui_events
      drop constraint if exists adaptive_ui_events_account_id_fkey;
    alter table public.adaptive_ui_events
      add constraint adaptive_ui_events_account_id_fkey
      foreign key (account_id)
      references public.user_broker_accounts(id)
      on delete set null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'adaptive_ui_suggestions'
      and column_name = 'account_id'
  ) then
    alter table public.adaptive_ui_suggestions
      drop constraint if exists adaptive_ui_suggestions_account_id_fkey;
    alter table public.adaptive_ui_suggestions
      add constraint adaptive_ui_suggestions_account_id_fkey
      foreign key (account_id)
      references public.user_broker_accounts(id)
      on delete set null;
  end if;
end $$;

alter table public.adaptive_ui_events enable row level security;
alter table public.adaptive_ui_profiles enable row level security;
alter table public.adaptive_ui_suggestions enable row level security;

drop policy if exists "adaptive_ui_events_select_own" on public.adaptive_ui_events;
create policy "adaptive_ui_events_select_own"
  on public.adaptive_ui_events
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "adaptive_ui_events_insert_own" on public.adaptive_ui_events;
create policy "adaptive_ui_events_insert_own"
  on public.adaptive_ui_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "adaptive_ui_profiles_select_own" on public.adaptive_ui_profiles;
create policy "adaptive_ui_profiles_select_own"
  on public.adaptive_ui_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "adaptive_ui_profiles_upsert_own" on public.adaptive_ui_profiles;
create policy "adaptive_ui_profiles_upsert_own"
  on public.adaptive_ui_profiles
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "adaptive_ui_suggestions_select_own" on public.adaptive_ui_suggestions;
create policy "adaptive_ui_suggestions_select_own"
  on public.adaptive_ui_suggestions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "adaptive_ui_suggestions_insert_own" on public.adaptive_ui_suggestions;
create policy "adaptive_ui_suggestions_insert_own"
  on public.adaptive_ui_suggestions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "adaptive_ui_suggestions_update_own" on public.adaptive_ui_suggestions;
create policy "adaptive_ui_suggestions_update_own"
  on public.adaptive_ui_suggestions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.axe_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null default 'general',
  content text not null default '',
  source_type text not null default 'seed',
  tags text[] not null default '{}'::text[],
  user_id uuid references auth.users (id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists axe_knowledge_documents_user_active_idx
  on public.axe_knowledge_documents (user_id, active);

alter table public.axe_knowledge_documents enable row level security;

drop policy if exists "axe_knowledge_documents_select" on public.axe_knowledge_documents;
create policy "axe_knowledge_documents_select"
  on public.axe_knowledge_documents for select
  using (user_id is null or auth.uid() = user_id);

create table if not exists public.axe_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.axe_knowledge_documents (id) on delete cascade,
  chunk_index integer not null default 0,
  chunk_text text not null,
  tags text[] not null default '{}'::text[],
  embedding vector(1536),
  created_at timestamptz not null default timezone('utc', now()),
  unique (document_id, chunk_index)
);

create index if not exists axe_knowledge_chunks_document_idx
  on public.axe_knowledge_chunks (document_id, chunk_index);

create index if not exists axe_knowledge_chunks_embedding_idx
  on public.axe_knowledge_chunks
  using hnsw (embedding vector_cosine_ops);

alter table public.axe_knowledge_chunks enable row level security;

drop policy if exists "axe_knowledge_chunks_select" on public.axe_knowledge_chunks;
create policy "axe_knowledge_chunks_select"
  on public.axe_knowledge_chunks for select
  using (
    exists (
      select 1
      from public.axe_knowledge_documents d
      where d.id = document_id
        and d.active = true
        and (d.user_id is null or d.user_id = auth.uid())
    )
  );

create or replace function public.match_axe_knowledge_chunks(
  query_embedding vector(1536),
  match_count integer default 12,
  match_user_id uuid default null
)
returns table (
  document_id uuid,
  slug text,
  title text,
  category text,
  chunk_text text,
  tags text[],
  similarity double precision
)
language sql
stable
as $$
  select
    c.document_id,
    d.slug,
    d.title,
    d.category,
    c.chunk_text,
    c.tags,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.axe_knowledge_chunks c
  join public.axe_knowledge_documents d on d.id = c.document_id
  where d.active = true
    and c.embedding is not null
    and (d.user_id is null or d.user_id = match_user_id)
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- Verification queries (run after migration in CI or SQL editor)
-- select to_regclass('public.adaptive_ui_events');
-- select to_regclass('public.adaptive_ui_profiles');
-- select to_regclass('public.adaptive_ui_suggestions');
-- select to_regclass('public.user_broker_accounts');
-- select to_regclass('public.axe_knowledge_documents');
-- select array_agg(enum_method order by enum_method)
-- from (
--   select unnest(regexp_matches(pg_get_constraintdef(oid), '''([^'']+)''', 'g'))[1] as enum_method
--   from pg_constraint
--   where conname = 'user_broker_accounts_connection_method_check'
-- ) methods;
