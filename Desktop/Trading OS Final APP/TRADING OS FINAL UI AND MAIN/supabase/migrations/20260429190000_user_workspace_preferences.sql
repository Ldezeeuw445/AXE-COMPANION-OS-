-- Per-user terminal UI state: watchlist layout, active symbol/recents, beginner mode.
-- Client syncs from `src/lib/userPreferencesCloud.ts` + `WorkspacePreferencesSync`.

CREATE TABLE IF NOT EXISTS public.user_workspace_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  watchlist_groups jsonb NOT NULL DEFAULT '{}'::jsonb,
  active_symbol text,
  recent_symbols jsonb NOT NULL DEFAULT '[]'::jsonb,
  beginner_mode boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_workspace_preferences_updated_idx ON public.user_workspace_preferences (updated_at DESC);

ALTER TABLE public.user_workspace_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_workspace_preferences_select_own" ON public.user_workspace_preferences;
CREATE POLICY "user_workspace_preferences_select_own" ON public.user_workspace_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_workspace_preferences_insert_own" ON public.user_workspace_preferences;
CREATE POLICY "user_workspace_preferences_insert_own" ON public.user_workspace_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_workspace_preferences_update_own" ON public.user_workspace_preferences;
CREATE POLICY "user_workspace_preferences_update_own" ON public.user_workspace_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_workspace_preferences_delete_own" ON public.user_workspace_preferences;
CREATE POLICY "user_workspace_preferences_delete_own" ON public.user_workspace_preferences
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_workspace_preferences TO authenticated;
