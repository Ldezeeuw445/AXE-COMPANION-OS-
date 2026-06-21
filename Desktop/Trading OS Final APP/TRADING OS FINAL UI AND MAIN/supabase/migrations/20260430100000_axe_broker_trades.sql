-- AXE Phase 1: broker accounts + trades + journal labels (MT5 ingest).
-- Multi-account per user, idempotent ingest (account_id + external_trade_id).

-- -------------------------------------------------------------------
-- 1) Broker accounts (per user)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_broker_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'mt5',
  label text NOT NULL DEFAULT 'MT5 Account',
  status text NOT NULL DEFAULT 'active',
  mt5_login text,
  mt5_server text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Hash only (token is shown once at creation time; never stored in plaintext).
  link_token_hash text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_broker_accounts_user_idx ON public.user_broker_accounts (user_id, created_at DESC);

ALTER TABLE public.user_broker_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_broker_accounts_select_own" ON public.user_broker_accounts;
CREATE POLICY "user_broker_accounts_select_own" ON public.user_broker_accounts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_broker_accounts_insert_own" ON public.user_broker_accounts;
CREATE POLICY "user_broker_accounts_insert_own" ON public.user_broker_accounts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_broker_accounts_update_own" ON public.user_broker_accounts;
CREATE POLICY "user_broker_accounts_update_own" ON public.user_broker_accounts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_broker_accounts_delete_own" ON public.user_broker_accounts;
CREATE POLICY "user_broker_accounts_delete_own" ON public.user_broker_accounts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_broker_accounts TO authenticated;

-- -------------------------------------------------------------------
-- 2) Broker trades (fills/closed trades history)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.broker_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.user_broker_accounts (id) ON DELETE CASCADE,
  external_trade_id text NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  volume numeric NOT NULL DEFAULT 0,
  open_time timestamptz,
  close_time timestamptz,
  open_price numeric,
  close_price numeric,
  pnl numeric NOT NULL DEFAULT 0,
  fees numeric NOT NULL DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotent ingest: per-account external trade id must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS broker_trades_account_external_uidx
  ON public.broker_trades (account_id, external_trade_id);

CREATE INDEX IF NOT EXISTS broker_trades_user_close_idx
  ON public.broker_trades (user_id, close_time DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS broker_trades_account_close_idx
  ON public.broker_trades (account_id, close_time DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS broker_trades_user_symbol_idx
  ON public.broker_trades (user_id, symbol);

ALTER TABLE public.broker_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broker_trades_select_own" ON public.broker_trades;
CREATE POLICY "broker_trades_select_own" ON public.broker_trades
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "broker_trades_insert_own" ON public.broker_trades;
CREATE POLICY "broker_trades_insert_own" ON public.broker_trades
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "broker_trades_update_own" ON public.broker_trades;
CREATE POLICY "broker_trades_update_own" ON public.broker_trades
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "broker_trades_delete_own" ON public.broker_trades;
CREATE POLICY "broker_trades_delete_own" ON public.broker_trades
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broker_trades TO authenticated;

-- -------------------------------------------------------------------
-- 3) Trade journal label (1 per trade)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trade_journal_labels (
  trade_id uuid PRIMARY KEY REFERENCES public.broker_trades (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.user_broker_accounts (id) ON DELETE CASCADE,
  label text NOT NULL CHECK (label IN ('PerfectlyExecuted','Good','Impatient','EmotionalWreck','VeryStupid')),
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_journal_labels_user_idx ON public.trade_journal_labels (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS trade_journal_labels_account_idx ON public.trade_journal_labels (account_id, updated_at DESC);

ALTER TABLE public.trade_journal_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trade_journal_labels_select_own" ON public.trade_journal_labels;
CREATE POLICY "trade_journal_labels_select_own" ON public.trade_journal_labels
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "trade_journal_labels_insert_own" ON public.trade_journal_labels;
CREATE POLICY "trade_journal_labels_insert_own" ON public.trade_journal_labels
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "trade_journal_labels_update_own" ON public.trade_journal_labels;
CREATE POLICY "trade_journal_labels_update_own" ON public.trade_journal_labels
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "trade_journal_labels_delete_own" ON public.trade_journal_labels;
CREATE POLICY "trade_journal_labels_delete_own" ON public.trade_journal_labels
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_journal_labels TO authenticated;

-- -------------------------------------------------------------------
-- 4) Active account preference (extend existing workspace prefs)
-- -------------------------------------------------------------------
ALTER TABLE public.user_workspace_preferences
  ADD COLUMN IF NOT EXISTS active_account_id uuid REFERENCES public.user_broker_accounts (id) ON DELETE SET NULL;

