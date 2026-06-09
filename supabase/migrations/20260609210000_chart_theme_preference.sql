-- Add chart_theme column to user_workspace_preferences
-- Stores the user's preferred chart color scheme: midnight, charcoal, slate, paper
alter table public.user_workspace_preferences
  add column if not exists chart_theme text not null default 'midnight';

comment on column public.user_workspace_preferences.chart_theme is
  'Chart color scheme key: midnight | charcoal | slate | paper';
