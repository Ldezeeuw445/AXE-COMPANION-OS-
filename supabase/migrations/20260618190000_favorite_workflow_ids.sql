alter table public.user_workspace_preferences
  add column if not exists favorite_workflow_ids text[] default '{}';

comment on column public.user_workspace_preferences.favorite_workflow_ids is
  'Up to 5 workflow action ids for chart quick menu and actions favorites row.';
