alter table public.user_workspace_preferences
  add column if not exists default_trade_volume numeric default 0.10,
  add column if not exists alert_auto_trade_enabled boolean not null default false;

comment on column public.user_workspace_preferences.default_trade_volume is
  'Default lot size for AXE drafts and optional alert auto-trade (0.01–5).';
comment on column public.user_workspace_preferences.alert_auto_trade_enabled is
  'When true, price alerts may place a market order at default_trade_volume (above=buy, below=sell).';
