alter table public.user_workspace_preferences
  add column if not exists alert_sl_offset numeric,
  add column if not exists alert_tp_offset numeric;

comment on column public.user_workspace_preferences.alert_sl_offset is
  'Default distance from alert threshold for stop-loss (price units). Used to pre-fill per-alert SL.';
comment on column public.user_workspace_preferences.alert_tp_offset is
  'Default distance from alert threshold for take-profit (price units). Used to pre-fill per-alert TP.';
