-- 20260509143000_broker_accounts_allow_demo_paper
--
-- Earlier connection_method check only permitted ['cloud_mt5', 'local_bridge'],
-- which silently rejected the auto-seed of the AXE Demo Account
-- (connection_method='demo_paper'). This loosens the constraint so the
-- ensureDemoAccount() insert in src/lib/broker/demoAccount.ts succeeds for
-- every authenticated user.
-- Wrapped in DO block: skips gracefully if table doesn't exist yet.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_broker_accounts') THEN
    ALTER TABLE public.user_broker_accounts
      DROP CONSTRAINT IF EXISTS user_broker_accounts_connection_method_check;

    ALTER TABLE public.user_broker_accounts
      ADD CONSTRAINT user_broker_accounts_connection_method_check
      CHECK (connection_method = ANY (ARRAY['cloud_mt5'::text, 'local_bridge'::text, 'demo_paper'::text]));

    COMMENT ON COLUMN public.user_broker_accounts.connection_method IS
      'cloud_mt5 (MetaApi), local_bridge (legacy ingest), demo_paper (AXE virtual paper)';
  END IF;
END $$;
