-- When true, chart SL/TP drag applies immediately on release (legacy behavior).
-- When false (default), trader confirms with the entry-line arrow like MT5.

alter table public.user_workspace_preferences
  add column if not exists instant_sl_tp_modify boolean not null default false;

comment on column public.user_workspace_preferences.instant_sl_tp_modify is
  'If true, SL/TP drag on chart commits on release. If false, requires confirm on entry label.';
