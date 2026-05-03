-- =============================================================================
-- AXE Companion — MetaApi cloud MT5 (copy-paste in Supabase → SQL Editor)
-- =============================================================================
-- Safe to run more than once (IF NOT EXISTS).
-- Run this BEFORE testing cloud MT5 connect in the app.
-- =============================================================================

alter table public.user_broker_accounts
  add column if not exists connection_method text,
  add column if not exists external_connection_id text,
  add column if not exists provider_status text,
  add column if not exists last_sync_at timestamptz,
  add column if not exists masked_login text,
  add column if not exists metadata jsonb default '{}'::jsonb;

comment on column public.user_broker_accounts.connection_method is 'e.g. cloud_mt5, token_ingest';
comment on column public.user_broker_accounts.external_connection_id is 'MetaApi trading account id';

alter table public.broker_trades
  add column if not exists external_trade_id text,
  add column if not exists raw jsonb;

create unique index if not exists broker_trades_account_id_external_trade_id_uidx
  on public.broker_trades (account_id, external_trade_id)
  where external_trade_id is not null;
