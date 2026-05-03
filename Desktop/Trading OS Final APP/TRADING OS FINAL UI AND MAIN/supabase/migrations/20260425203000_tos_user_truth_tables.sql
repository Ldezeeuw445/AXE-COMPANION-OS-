-- Trading OS: user truth tables expected by SupabaseProvider + AccountService / AxeService.
-- Apply via: Supabase Dashboard → SQL Editor (paste + run), or `supabase db push` when linked.

-- ---------------------------------------------------------------------------
-- accounts (one row per user; Main overview + getAccountSummary)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  balance numeric NOT NULL DEFAULT 0,
  equity numeric NOT NULL DEFAULT 0,
  margin_used numeric NOT NULL DEFAULT 0,
  margin_available numeric NOT NULL DEFAULT 0,
  open_pnl numeric NOT NULL DEFAULT 0,
  closed_pnl numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- positions (open/closed; AccountService maps snake_case)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  symbol text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('long', 'short')),
  size numeric NOT NULL DEFAULT 0,
  entry_price numeric NOT NULL DEFAULT 0,
  current_price numeric NOT NULL DEFAULT 0,
  stop_loss numeric,
  take_profit numeric,
  pnl numeric NOT NULL DEFAULT 0,
  pnl_percent numeric NOT NULL DEFAULT 0,
  margin numeric NOT NULL DEFAULT 0,
  opened_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
);

CREATE INDEX IF NOT EXISTS positions_user_id_status_idx ON public.positions (user_id, status);

-- ---------------------------------------------------------------------------
-- watchlists
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  symbol text NOT NULL,
  name text,
  price numeric NOT NULL DEFAULT 0,
  change numeric NOT NULL DEFAULT 0,
  change_percent numeric NOT NULL DEFAULT 0,
  volume numeric,
  high_24h numeric,
  low_24h numeric,
  alerts jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT watchlists_user_symbol_unique UNIQUE (user_id, symbol)
);

CREATE INDEX IF NOT EXISTS watchlists_user_id_idx ON public.watchlists (user_id);

-- ---------------------------------------------------------------------------
-- axe_memory (AxeService)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.axe_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  symbol text,
  type text NOT NULL DEFAULT 'insight',
  content text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS axe_memory_user_id_created_idx ON public.axe_memory (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.axe_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounts_select_own" ON public.accounts;
CREATE POLICY "accounts_select_own" ON public.accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "accounts_insert_own" ON public.accounts;
CREATE POLICY "accounts_insert_own" ON public.accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "accounts_update_own" ON public.accounts;
CREATE POLICY "accounts_update_own" ON public.accounts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "positions_select_own" ON public.positions;
CREATE POLICY "positions_select_own" ON public.positions FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "positions_insert_own" ON public.positions;
CREATE POLICY "positions_insert_own" ON public.positions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "positions_update_own" ON public.positions;
CREATE POLICY "positions_update_own" ON public.positions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "positions_delete_own" ON public.positions;
CREATE POLICY "positions_delete_own" ON public.positions FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "watchlists_select_own" ON public.watchlists;
CREATE POLICY "watchlists_select_own" ON public.watchlists FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "watchlists_insert_own" ON public.watchlists;
CREATE POLICY "watchlists_insert_own" ON public.watchlists FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "watchlists_update_own" ON public.watchlists;
CREATE POLICY "watchlists_update_own" ON public.watchlists FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "watchlists_delete_own" ON public.watchlists;
CREATE POLICY "watchlists_delete_own" ON public.watchlists FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "axe_memory_select_own" ON public.axe_memory;
CREATE POLICY "axe_memory_select_own" ON public.axe_memory FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "axe_memory_insert_own" ON public.axe_memory;
CREATE POLICY "axe_memory_insert_own" ON public.axe_memory FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "axe_memory_update_own" ON public.axe_memory;
CREATE POLICY "axe_memory_update_own" ON public.axe_memory FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "axe_memory_delete_own" ON public.axe_memory;
CREATE POLICY "axe_memory_delete_own" ON public.axe_memory FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- New signups: default account row (SECURITY DEFINER bypasses RLS once)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tos_ensure_account_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.accounts (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tos_on_auth_user_created_accounts ON auth.users;
CREATE TRIGGER tos_on_auth_user_created_accounts
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.tos_ensure_account_for_new_user();

-- ---------------------------------------------------------------------------
-- Backfill existing users (no account row yet)
-- ---------------------------------------------------------------------------
INSERT INTO public.accounts (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
