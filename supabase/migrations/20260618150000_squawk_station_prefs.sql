-- Squawk channel selection (which audio stations rotate in chart squawk bar)
alter table public.user_workspace_preferences
  add column if not exists squawk_station_ids text[];

comment on column public.user_workspace_preferences.squawk_station_ids is
  'Enabled squawk radio station ids (bbc-world, npr-news, etc.). Null = all defaults.';
