-- Per-user notes + trade journal (Trading OS). RLS: authenticated users only, own rows.
-- Apply: `supabase db push` or SQL Editor.

-- ---------------------------------------------------------------------------
-- user_trading_notes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_trading_notes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  symbol text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_trading_notes_user_updated_idx ON public.user_trading_notes (user_id, updated_at DESC);

ALTER TABLE public.user_trading_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_trading_notes_select_own" ON public.user_trading_notes;
CREATE POLICY "user_trading_notes_select_own" ON public.user_trading_notes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_trading_notes_insert_own" ON public.user_trading_notes;
CREATE POLICY "user_trading_notes_insert_own" ON public.user_trading_notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_trading_notes_update_own" ON public.user_trading_notes;
CREATE POLICY "user_trading_notes_update_own" ON public.user_trading_notes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_trading_notes_delete_own" ON public.user_trading_notes;
CREATE POLICY "user_trading_notes_delete_own" ON public.user_trading_notes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_trading_notes TO authenticated;

-- ---------------------------------------------------------------------------
-- user_journal_entries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_journal_entries (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  symbol text NOT NULL,
  notes text NOT NULL,
  rating text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  pnl numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_journal_entries_user_created_idx ON public.user_journal_entries (user_id, created_at DESC);

ALTER TABLE public.user_journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_journal_entries_select_own" ON public.user_journal_entries;
CREATE POLICY "user_journal_entries_select_own" ON public.user_journal_entries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_journal_entries_insert_own" ON public.user_journal_entries;
CREATE POLICY "user_journal_entries_insert_own" ON public.user_journal_entries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_journal_entries_update_own" ON public.user_journal_entries;
CREATE POLICY "user_journal_entries_update_own" ON public.user_journal_entries
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_journal_entries_delete_own" ON public.user_journal_entries;
CREATE POLICY "user_journal_entries_delete_own" ON public.user_journal_entries
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_journal_entries TO authenticated;
