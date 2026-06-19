-- Alert auto-trade arm window + execution draft lot size
alter table public.user_workspace_preferences
  add column if not exists alert_auto_trade_armed_at timestamptz;

comment on column public.user_workspace_preferences.alert_auto_trade_armed_at is
  'When set and within 30 minutes, price-alert auto-trade may fire (requires alert_auto_trade_enabled + live_trading_enabled).';

alter table public.execution_requests
  add column if not exists volume_lots numeric;

comment on column public.execution_requests.volume_lots is
  'Lot size AXE proposed for this draft; falls back to user default_trade_volume when null.';
