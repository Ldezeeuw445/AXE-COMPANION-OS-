-- AXE Companion: MetaApi cloud MT5 columns + broker_trades dedupe key.
-- Apply in Supabase SQL editor or via CLI. Safe to re-run (IF NOT EXISTS).
-- Wrapped in DO blocks: skips gracefully if tables don't exist yet.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_broker_accounts') THEN
    ALTER TABLE public.user_broker_accounts
      ADD COLUMN IF NOT EXISTS connection_method text,
      ADD COLUMN IF NOT EXISTS external_connection_id text,
      ADD COLUMN IF NOT EXISTS provider_status text,
      ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
      ADD COLUMN IF NOT EXISTS masked_login text,
      ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

    COMMENT ON COLUMN public.user_broker_accounts.connection_method IS 'e.g. cloud_mt5, token_ingest';
    COMMENT ON COLUMN public.user_broker_accounts.external_connection_id IS 'MetaApi trading account id (server-side only in env)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'broker_trades') THEN
    ALTER TABLE public.broker_trades
      ADD COLUMN IF NOT EXISTS external_trade_id text,
      ADD COLUMN IF NOT EXISTS raw jsonb;

    -- Dedupe MetaApi sync rows per companion account (partial: nulls allowed for legacy ingest).
    CREATE UNIQUE INDEX IF NOT EXISTS broker_trades_account_id_external_trade_id_uidx
      ON public.broker_trades (account_id, external_trade_id)
      WHERE external_trade_id IS NOT NULL;
  END IF;
END $$;
