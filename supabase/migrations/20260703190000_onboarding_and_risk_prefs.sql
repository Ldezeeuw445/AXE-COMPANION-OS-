-- Smart onboarding completion + default terminal prefs

alter table public.user_workspace_preferences
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists default_chart_timeframe text not null default 'h1',
  add column if not exists default_risk_percent numeric(5,2) not null default 1.00,
  add column if not exists max_account_risk_percent numeric(5,2) not null default 5.00;

comment on column public.user_workspace_preferences.onboarding_completed_at is
  'When the user finished the smart onboarding wizard (null = show wizard).';
comment on column public.user_workspace_preferences.default_chart_timeframe is
  'Preferred chart timeframe set during onboarding (h1, h4, d1, etc.).';
comment on column public.user_workspace_preferences.default_risk_percent is
  'Default risk per trade as % of account equity.';
comment on column public.user_workspace_preferences.max_account_risk_percent is
  'Soft cap for total open-book risk as % of equity (funded-account guardrail).';
