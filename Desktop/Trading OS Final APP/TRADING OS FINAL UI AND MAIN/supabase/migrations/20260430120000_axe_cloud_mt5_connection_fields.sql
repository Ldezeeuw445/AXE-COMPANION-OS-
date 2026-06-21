-- AXE Companion: cloud MT5 connector metadata + local bridge distinction.
-- Raw MT5 passwords must NOT be stored here; use provider vault / external IDs when wired.

ALTER TABLE public.user_broker_accounts
  ADD COLUMN IF NOT EXISTS connection_method text NOT NULL DEFAULT 'local_bridge';

ALTER TABLE public.user_broker_accounts
  DROP CONSTRAINT IF EXISTS user_broker_accounts_connection_method_check;

ALTER TABLE public.user_broker_accounts
  ADD CONSTRAINT user_broker_accounts_connection_method_check
  CHECK (connection_method IN ('cloud_mt5', 'local_bridge'));

ALTER TABLE public.user_broker_accounts
  ADD COLUMN IF NOT EXISTS external_connection_id text;

ALTER TABLE public.user_broker_accounts
  ADD COLUMN IF NOT EXISTS provider_status text;

ALTER TABLE public.user_broker_accounts
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;

ALTER TABLE public.user_broker_accounts
  ADD COLUMN IF NOT EXISTS masked_login text;

ALTER TABLE public.user_broker_accounts
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_broker_accounts.connection_method IS 'cloud_mt5 = server-side connector; local_bridge = EA / axe-mt5-ingest token.';
COMMENT ON COLUMN public.user_broker_accounts.external_connection_id IS 'Opaque id from MT5 cloud provider (e.g. MetaApi); never store raw broker passwords in this table.';
COMMENT ON COLUMN public.user_broker_accounts.provider_status IS 'UX + sync lifecycle: connected, syncing, failed, provider_not_configured, disconnected, etc.';
COMMENT ON COLUMN public.user_broker_accounts.masked_login IS 'Non-secret display hint for MT5 login (e.g. last 2 digits).';
