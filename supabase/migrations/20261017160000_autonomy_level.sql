-- How much AXE may do on its own, per user.
--
-- Before this there was one switch: `alert_auto_trade_enabled`, between "AXE
-- suggests" and "AXE sends live orders to MT5 while you are asleep". The guard
-- in autoTradeGuard.ts kept that from being reckless, but every number it used
-- came from the broker's account profile or from a constant in the source.
-- Nowhere had the trader said, in their own words, how much they were willing
-- to lose to a machine.
--
-- Level 2 is the default on purpose: AXE prepares, a human presses. Level 3 is
-- a decision someone makes, never one they inherit.
--
-- The three acknowledgements are stored as columns rather than a blob so that
-- "did this person actually agree to unattended trading?" is a question SQL can
-- answer during a dispute.

alter table public.user_workspace_preferences
  add column if not exists autonomy_level smallint not null default 2,
  add column if not exists autonomy_max_lot numeric,
  add column if not exists autonomy_max_risk_pct numeric,
  add column if not exists autonomy_max_trades_per_day smallint,
  add column if not exists autonomy_ack_unattended boolean not null default false,
  add column if not exists autonomy_ack_limits boolean not null default false,
  add column if not exists autonomy_ack_loss boolean not null default false,
  add column if not exists autonomy_granted_at timestamptz;

-- A level outside 1..3 is a bug, not a preference. resolveAutonomy() already
-- falls back to 2, but the column should not be able to hold nonsense either.
alter table public.user_workspace_preferences
  drop constraint if exists user_workspace_preferences_autonomy_level_check;
alter table public.user_workspace_preferences
  add constraint user_workspace_preferences_autonomy_level_check
  check (autonomy_level between 1 and 3);

comment on column public.user_workspace_preferences.autonomy_level is
  '1 suggest, 2 prepare (default), 3 place unattended. Level 3 only applies when the three limits and the three acknowledgements are all present — see src/lib/trading/autonomy.ts.';
comment on column public.user_workspace_preferences.autonomy_granted_at is
  'When all three acknowledgements were last ticked. Null while any is false.';
