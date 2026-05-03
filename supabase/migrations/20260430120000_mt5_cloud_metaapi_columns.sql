-- AXE Companion: MetaApi cloud MT5 columns + broker_trades dedupe key.
-- Apply in Supabase SQL editor or via CLI. Safe to re-run (IF NOT EXISTS).

alter table public.user_broker_accounts
  add column if not exists connection_method text,
  add column if not exists external_connection_id text,
  add column if not exists provider_status text,
  add column if not exists last_sync_at timestamptz,
  add column if not exists masked_login text,
  add column if not exists metadata jsonb default '{}'::jsonb;

comment on column public.user_broker_accounts.connection_method is 'e.g. cloud_mt5, token_ingest';
comment on column public.user_broker_accounts.external_connection_id is 'MetaApi trading account id (server-side only in env)';

alter table public.broker_trades
  add column if not exists external_trade_id text,
  add column if not exists raw jsonb;

-- Dedupe MetaApi sync rows per companion account (partial: nulls allowed for legacy ingest).
create unique index if not exists broker_trades_account_id_external_trade_id_uidx
  on public.broker_trades (account_id, external_trade_id)
  where external_trade_id is not null;
