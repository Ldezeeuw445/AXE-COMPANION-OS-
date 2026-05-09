-- 20260509143000_broker_accounts_allow_demo_paper
--
-- Earlier connection_method check only permitted ['cloud_mt5', 'local_bridge'],
-- which silently rejected the auto-seed of the AXE Demo Account
-- (connection_method='demo_paper'). This loosens the constraint so the
-- ensureDemoAccount() insert in src/lib/broker/demoAccount.ts succeeds for
-- every authenticated user.

alter table public.user_broker_accounts
  drop constraint if exists user_broker_accounts_connection_method_check;

alter table public.user_broker_accounts
  add constraint user_broker_accounts_connection_method_check
  check (connection_method = any (array['cloud_mt5'::text, 'local_bridge'::text, 'demo_paper'::text]));

comment on column public.user_broker_accounts.connection_method is
  'cloud_mt5 (MetaApi), local_bridge (legacy ingest), demo_paper (AXE virtual paper)';
