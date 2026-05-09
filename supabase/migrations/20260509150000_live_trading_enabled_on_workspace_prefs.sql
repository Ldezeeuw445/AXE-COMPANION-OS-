-- 20260509150000_live_trading_enabled_on_workspace_prefs
--
-- Persist live-trading activation server-side so it survives reinstall and
-- carries across devices for the same account. The per-order confirm modal
-- and 30-min arming window stay client-side (per device) — only the
-- long-term "I accepted the risks" flag lives here.

alter table public.user_workspace_preferences
  add column if not exists live_trading_enabled boolean not null default false,
  add column if not exists live_trading_enabled_at timestamptz;

comment on column public.user_workspace_preferences.live_trading_enabled is
  'User has acknowledged live-trading risks for this account. Per-order confirm still required at the chart.';
comment on column public.user_workspace_preferences.live_trading_enabled_at is
  'When the user accepted the live-trading disclaimer. Used for staleness checks.';
