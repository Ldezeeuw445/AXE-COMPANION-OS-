-- Unify Companion ↔ Trading OS duplicate tables on pqnngpcgbdwxavbatbia.
-- Owner-approved 2026-11-04. Non-destructive: canonical tables + data migrate +
-- compatibility views (old names) with INSTEAD OF triggers so TOS keeps working
-- without a code change in this PR.
--
-- Canonicals:
--   (a) user_alerts          ← absorbs user_price_alerts
--   (b) user_chart_states    ← absorbs prefs-shaped rows; user_chart_preferences view
--   (c) axe_user_rules       ← absorbs user_risk_profiles
--   (d) user_signals         ← new
--
-- C7 alert auto-trade: metadata / order paths are NOT altered. Extra columns are
-- additive. Alert evaluation behaviour stays identical.
--
-- Apply via: supabase link + db push (needs SUPABASE_ACCESS_TOKEN, PROJECT_REF,
-- SUPABASE_DB_PASSWORD) or SQL editor. Safe to re-run (IF EXISTS / OR REPLACE).

BEGIN;

-- =============================================================================
-- (a) ALERTS — expand user_alerts, migrate user_price_alerts, compat view
-- =============================================================================

ALTER TABLE public.user_alerts
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS last_evaluated_at timestamptz,
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS spec jsonb,
  ADD COLUMN IF NOT EXISTS timeframes text[],
  ADD COLUMN IF NOT EXISTS cooldown_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rearm_policy text NOT NULL DEFAULT 'once',
  ADD COLUMN IF NOT EXISTS last_fired_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_explanation text,
  ADD COLUMN IF NOT EXISTS armed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_kind text NOT NULL DEFAULT 'price',
  ADD COLUMN IF NOT EXISTS account_id text,
  ADD COLUMN IF NOT EXISTS source_app text NOT NULL DEFAULT 'companion';

-- Keep price and threshold in sync for dual-app reads.
CREATE OR REPLACE FUNCTION public.user_alerts_sync_price_threshold()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.price IS NULL AND NEW.threshold IS NOT NULL THEN
    NEW.price := NEW.threshold;
  ELSIF NEW.threshold IS NULL AND NEW.price IS NOT NULL THEN
    NEW.threshold := NEW.price;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.price IS DISTINCT FROM OLD.price AND (NEW.threshold IS NOT DISTINCT FROM OLD.threshold) THEN
      NEW.threshold := NEW.price;
    ELSIF NEW.threshold IS DISTINCT FROM OLD.threshold AND (NEW.price IS NOT DISTINCT FROM OLD.price) THEN
      NEW.price := NEW.threshold;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_alerts_sync_price_threshold_trg ON public.user_alerts;
CREATE TRIGGER user_alerts_sync_price_threshold_trg
  BEFORE INSERT OR UPDATE ON public.user_alerts
  FOR EACH ROW EXECUTE FUNCTION public.user_alerts_sync_price_threshold();

-- Migrate TOS price alerts when the physical table still exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_price_alerts'
      AND table_type = 'BASE TABLE'
  ) THEN
    INSERT INTO public.user_alerts (
      id, user_id, symbol, type, condition, threshold, price, status,
      note, triggered_at, created_at, last_evaluated_at,
      spec, timeframes, cooldown_seconds, rearm_policy, last_fired_at,
      last_explanation, armed, alert_kind, account_id, source_app, metadata
    )
    SELECT
      p.id,
      p.user_id,
      p.symbol,
      CASE
        WHEN p.condition = 'smart' THEN 'smart'
        WHEN p.alert_kind IS NOT NULL AND p.alert_kind <> 'price' THEN p.alert_kind
        ELSE 'price'
      END,
      p.condition,
      p.price,
      p.price,
      CASE
        WHEN p.status IN ('active', 'triggered', 'expired') THEN p.status
        WHEN p.status = 'paused' THEN 'disabled'
        ELSE coalesce(p.status, 'active')
      END,
      p.note,
      p.triggered_at,
      p.created_at,
      p.last_evaluated_at,
      p.spec,
      p.timeframes,
      coalesce(p.cooldown_seconds, 0),
      coalesce(p.rearm_policy, 'once'),
      p.last_fired_at,
      p.last_explanation,
      coalesce(p.armed, true),
      coalesce(p.alert_kind, 'price'),
      p.account_id,
      'trading-os',
      jsonb_build_object('migrated_from', 'user_price_alerts')
    FROM public.user_price_alerts p
    ON CONFLICT (id) DO NOTHING;

    -- Repoint trigger history FK to user_alerts before dropping/renaming.
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'user_alert_trigger_history'
    ) THEN
      ALTER TABLE public.user_alert_trigger_history
        DROP CONSTRAINT IF EXISTS user_alert_trigger_history_alert_id_fkey;
      ALTER TABLE public.user_alert_trigger_history
        ADD CONSTRAINT user_alert_trigger_history_alert_id_fkey
        FOREIGN KEY (alert_id) REFERENCES public.user_alerts (id) ON DELETE CASCADE;
    END IF;

    ALTER TABLE public.user_price_alerts RENAME TO user_price_alerts_legacy;
  END IF;
END $$;

-- Compatibility view: TOS keeps .from('user_price_alerts')
CREATE OR REPLACE VIEW public.user_price_alerts AS
SELECT
  id,
  user_id,
  symbol,
  condition,
  coalesce(price, threshold) AS price,
  CASE
    WHEN status = 'disabled' THEN 'paused'
    ELSE status
  END AS status,
  note,
  created_at,
  triggered_at,
  last_evaluated_at,
  spec,
  timeframes,
  cooldown_seconds,
  rearm_policy,
  last_fired_at,
  last_explanation,
  armed,
  alert_kind,
  account_id
FROM public.user_alerts
WHERE source_app = 'trading-os';

CREATE OR REPLACE FUNCTION public.user_price_alerts_instead_of_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;
  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;
  IF NEW.status IS NULL THEN
    NEW.status := 'active';
  END IF;
  IF NEW.cooldown_seconds IS NULL THEN
    NEW.cooldown_seconds := 0;
  END IF;
  IF NEW.rearm_policy IS NULL THEN
    NEW.rearm_policy := 'once';
  END IF;
  IF NEW.armed IS NULL THEN
    NEW.armed := true;
  END IF;
  IF NEW.alert_kind IS NULL THEN
    NEW.alert_kind := 'price';
  END IF;

  INSERT INTO public.user_alerts (
    id, user_id, symbol, type, condition, threshold, price, status, note,
    created_at, triggered_at, last_evaluated_at, spec, timeframes,
    cooldown_seconds, rearm_policy, last_fired_at, last_explanation,
    armed, alert_kind, account_id, source_app, metadata
  ) VALUES (
    NEW.id,
    NEW.user_id,
    NEW.symbol,
    CASE WHEN NEW.condition = 'smart' THEN 'smart' ELSE coalesce(NEW.alert_kind, 'price') END,
    NEW.condition,
    NEW.price,
    NEW.price,
    CASE WHEN NEW.status = 'paused' THEN 'disabled' ELSE NEW.status END,
    NEW.note,
    NEW.created_at,
    NEW.triggered_at,
    NEW.last_evaluated_at,
    NEW.spec,
    NEW.timeframes,
    NEW.cooldown_seconds,
    NEW.rearm_policy,
    NEW.last_fired_at,
    NEW.last_explanation,
    NEW.armed,
    NEW.alert_kind,
    NEW.account_id,
    'trading-os',
    '{}'::jsonb
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_price_alerts_instead_of_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE public.user_alerts SET
    symbol = NEW.symbol,
    condition = NEW.condition,
    threshold = NEW.price,
    price = NEW.price,
    status = CASE WHEN NEW.status = 'paused' THEN 'disabled' ELSE NEW.status END,
    note = NEW.note,
    triggered_at = NEW.triggered_at,
    last_evaluated_at = NEW.last_evaluated_at,
    spec = NEW.spec,
    timeframes = NEW.timeframes,
    cooldown_seconds = coalesce(NEW.cooldown_seconds, cooldown_seconds),
    rearm_policy = coalesce(NEW.rearm_policy, rearm_policy),
    last_fired_at = NEW.last_fired_at,
    last_explanation = NEW.last_explanation,
    armed = coalesce(NEW.armed, armed),
    alert_kind = coalesce(NEW.alert_kind, alert_kind),
    account_id = NEW.account_id
  WHERE id = OLD.id AND user_id = OLD.user_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_price_alerts_instead_of_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  DELETE FROM public.user_alerts WHERE id = OLD.id AND user_id = OLD.user_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS user_price_alerts_instead_of_insert_trg ON public.user_price_alerts;
DROP TRIGGER IF EXISTS user_price_alerts_instead_of_update_trg ON public.user_price_alerts;
DROP TRIGGER IF EXISTS user_price_alerts_instead_of_delete_trg ON public.user_price_alerts;

CREATE TRIGGER user_price_alerts_instead_of_insert_trg
  INSTEAD OF INSERT ON public.user_price_alerts
  FOR EACH ROW EXECUTE FUNCTION public.user_price_alerts_instead_of_insert();

CREATE TRIGGER user_price_alerts_instead_of_update_trg
  INSTEAD OF UPDATE ON public.user_price_alerts
  FOR EACH ROW EXECUTE FUNCTION public.user_price_alerts_instead_of_update();

CREATE TRIGGER user_price_alerts_instead_of_delete_trg
  INSTEAD OF DELETE ON public.user_price_alerts
  FOR EACH ROW EXECUTE FUNCTION public.user_price_alerts_instead_of_delete();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_price_alerts TO authenticated;
GRANT ALL ON public.user_price_alerts TO service_role;

-- =============================================================================
-- (b) CHART — canonical user_chart_states; prefs as view over marker rows
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_chart_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  layout_id text NOT NULL DEFAULT 'default',
  workspace_id text NOT NULL DEFAULT 'trading-os',
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol, timeframe, layout_id, workspace_id)
);

ALTER TABLE public.user_chart_states
  ADD COLUMN IF NOT EXISTS account_key text NOT NULL DEFAULT '*',
  ADD COLUMN IF NOT EXISTS prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Prefs need account_key in the uniqueness key (Companion multi-account scopes).
ALTER TABLE public.user_chart_states
  DROP CONSTRAINT IF EXISTS user_chart_states_user_id_symbol_timeframe_layout_id_workspace_id_key;
ALTER TABLE public.user_chart_states
  DROP CONSTRAINT IF EXISTS user_chart_states_user_symbol_tf_layout_ws_account_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_chart_states_user_symbol_tf_layout_ws_account_key'
  ) THEN
    ALTER TABLE public.user_chart_states
      ADD CONSTRAINT user_chart_states_user_symbol_tf_layout_ws_account_key
      UNIQUE (user_id, symbol, timeframe, layout_id, workspace_id, account_key);
  END IF;
END $$;

ALTER TABLE public.user_chart_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_chart_states_select_own" ON public.user_chart_states;
CREATE POLICY "user_chart_states_select_own" ON public.user_chart_states
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_chart_states_insert_own" ON public.user_chart_states;
CREATE POLICY "user_chart_states_insert_own" ON public.user_chart_states
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_chart_states_update_own" ON public.user_chart_states;
CREATE POLICY "user_chart_states_update_own" ON public.user_chart_states
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_chart_states_delete_own" ON public.user_chart_states;
CREATE POLICY "user_chart_states_delete_own" ON public.user_chart_states
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_chart_states TO authenticated;
GRANT ALL ON public.user_chart_states TO service_role;

CREATE INDEX IF NOT EXISTS user_chart_states_user_updated_idx
  ON public.user_chart_states (user_id, updated_at DESC);

-- Migrate Companion prefs into marker rows on user_chart_states.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_chart_preferences'
      AND table_type = 'BASE TABLE'
  ) THEN
    INSERT INTO public.user_chart_states (
      user_id, symbol, timeframe, layout_id, workspace_id, account_key, prefs, state, updated_at
    )
    SELECT
      p.user_id,
      p.symbol_key,
      '*',
      'prefs',
      'companion-prefs',
      p.account_key,
      p.prefs,
      jsonb_build_object('prefs', p.prefs),
      p.updated_at
    FROM public.user_chart_preferences p
    ON CONFLICT (user_id, symbol, timeframe, layout_id, workspace_id, account_key) DO UPDATE
      SET prefs = EXCLUDED.prefs,
          state = EXCLUDED.state,
          account_key = EXCLUDED.account_key,
          updated_at = EXCLUDED.updated_at;

    ALTER TABLE public.user_chart_preferences RENAME TO user_chart_preferences_legacy;
  END IF;
END $$;

CREATE OR REPLACE VIEW public.user_chart_preferences AS
SELECT
  user_id,
  account_key,
  symbol AS symbol_key,
  prefs,
  updated_at
FROM public.user_chart_states
WHERE layout_id = 'prefs' AND workspace_id = 'companion-prefs' AND timeframe = '*';

CREATE OR REPLACE FUNCTION public.user_chart_preferences_instead_of_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF NEW.symbol_key IS NULL THEN NEW.symbol_key := '*'; END IF;
  IF NEW.account_key IS NULL THEN NEW.account_key := '*'; END IF;
  IF NEW.prefs IS NULL THEN NEW.prefs := '{}'::jsonb; END IF;
  IF NEW.updated_at IS NULL THEN NEW.updated_at := now(); END IF;

  INSERT INTO public.user_chart_states (
    user_id, symbol, timeframe, layout_id, workspace_id, account_key, prefs, state, updated_at
  ) VALUES (
    NEW.user_id,
    NEW.symbol_key,
    '*',
    'prefs',
    'companion-prefs',
    NEW.account_key,
    NEW.prefs,
    jsonb_build_object('prefs', NEW.prefs),
    NEW.updated_at
  )
  ON CONFLICT (user_id, symbol, timeframe, layout_id, workspace_id, account_key) DO UPDATE
    SET prefs = EXCLUDED.prefs,
        state = EXCLUDED.state,
        account_key = EXCLUDED.account_key,
        updated_at = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_chart_preferences_instead_of_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE public.user_chart_states SET
    prefs = NEW.prefs,
    state = jsonb_build_object('prefs', NEW.prefs),
    account_key = coalesce(NEW.account_key, account_key),
    updated_at = coalesce(NEW.updated_at, now())
  WHERE user_id = OLD.user_id
    AND symbol = OLD.symbol_key
    AND account_key = OLD.account_key
    AND layout_id = 'prefs'
    AND workspace_id = 'companion-prefs'
    AND timeframe = '*';
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_chart_preferences_instead_of_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  DELETE FROM public.user_chart_states
  WHERE user_id = OLD.user_id
    AND symbol = OLD.symbol_key
    AND account_key = OLD.account_key
    AND layout_id = 'prefs'
    AND workspace_id = 'companion-prefs'
    AND timeframe = '*';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS user_chart_preferences_instead_of_insert_trg ON public.user_chart_preferences;
DROP TRIGGER IF EXISTS user_chart_preferences_instead_of_update_trg ON public.user_chart_preferences;
DROP TRIGGER IF EXISTS user_chart_preferences_instead_of_delete_trg ON public.user_chart_preferences;

CREATE TRIGGER user_chart_preferences_instead_of_insert_trg
  INSTEAD OF INSERT ON public.user_chart_preferences
  FOR EACH ROW EXECUTE FUNCTION public.user_chart_preferences_instead_of_insert();

CREATE TRIGGER user_chart_preferences_instead_of_update_trg
  INSTEAD OF UPDATE ON public.user_chart_preferences
  FOR EACH ROW EXECUTE FUNCTION public.user_chart_preferences_instead_of_update();

CREATE TRIGGER user_chart_preferences_instead_of_delete_trg
  INSTEAD OF DELETE ON public.user_chart_preferences
  FOR EACH ROW EXECUTE FUNCTION public.user_chart_preferences_instead_of_delete();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_chart_preferences TO authenticated;
GRANT ALL ON public.user_chart_preferences TO service_role;

-- =============================================================================
-- (c) RISK — expand axe_user_rules, migrate user_risk_profiles, compat view
-- =============================================================================

ALTER TABLE public.axe_user_rules
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS currency text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_risk_profiles'
      AND table_type = 'BASE TABLE'
  ) THEN
    INSERT INTO public.axe_user_rules (
      id, user_id, rule_type, severity, rule_text, active,
      name, kind, limits, currency, created_at, updated_at
    )
    SELECT
      r.id,
      r.user_id,
      'risk_profile',
      'info',
      r.name,
      r.is_active,
      r.name,
      r.kind,
      coalesce(r.limits, '{}'::jsonb),
      r.currency,
      r.created_at,
      r.updated_at
    FROM public.user_risk_profiles r
    ON CONFLICT (id) DO NOTHING;

    ALTER TABLE public.user_risk_profiles RENAME TO user_risk_profiles_legacy;
  END IF;
END $$;

CREATE OR REPLACE VIEW public.user_risk_profiles AS
SELECT
  id,
  user_id,
  coalesce(name, rule_text) AS name,
  coalesce(kind, 'custom') AS kind,
  limits,
  currency,
  active AS is_active,
  created_at,
  updated_at
FROM public.axe_user_rules
WHERE rule_type = 'risk_profile';

CREATE OR REPLACE FUNCTION public.user_risk_profiles_instead_of_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF NEW.id IS NULL THEN NEW.id := gen_random_uuid(); END IF;
  IF NEW.is_active IS NULL THEN NEW.is_active := false; END IF;
  IF NEW.limits IS NULL THEN NEW.limits := '{}'::jsonb; END IF;
  IF NEW.created_at IS NULL THEN NEW.created_at := timezone('utc', now()); END IF;
  IF NEW.updated_at IS NULL THEN NEW.updated_at := timezone('utc', now()); END IF;

  INSERT INTO public.axe_user_rules (
    id, user_id, rule_type, severity, rule_text, active, name, kind, limits, currency, created_at, updated_at
  ) VALUES (
    NEW.id,
    NEW.user_id,
    'risk_profile',
    'info',
    NEW.name,
    NEW.is_active,
    NEW.name,
    NEW.kind,
    NEW.limits,
    NEW.currency,
    NEW.created_at,
    NEW.updated_at
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_risk_profiles_instead_of_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE public.axe_user_rules SET
    rule_text = NEW.name,
    name = NEW.name,
    kind = NEW.kind,
    limits = coalesce(NEW.limits, limits),
    currency = NEW.currency,
    active = coalesce(NEW.is_active, active),
    updated_at = coalesce(NEW.updated_at, timezone('utc', now()))
  WHERE id = OLD.id AND user_id = OLD.user_id AND rule_type = 'risk_profile';
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_risk_profiles_instead_of_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  DELETE FROM public.axe_user_rules
  WHERE id = OLD.id AND user_id = OLD.user_id AND rule_type = 'risk_profile';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS user_risk_profiles_instead_of_insert_trg ON public.user_risk_profiles;
DROP TRIGGER IF EXISTS user_risk_profiles_instead_of_update_trg ON public.user_risk_profiles;
DROP TRIGGER IF EXISTS user_risk_profiles_instead_of_delete_trg ON public.user_risk_profiles;

CREATE TRIGGER user_risk_profiles_instead_of_insert_trg
  INSTEAD OF INSERT ON public.user_risk_profiles
  FOR EACH ROW EXECUTE FUNCTION public.user_risk_profiles_instead_of_insert();

CREATE TRIGGER user_risk_profiles_instead_of_update_trg
  INSTEAD OF UPDATE ON public.user_risk_profiles
  FOR EACH ROW EXECUTE FUNCTION public.user_risk_profiles_instead_of_update();

CREATE TRIGGER user_risk_profiles_instead_of_delete_trg
  INSTEAD OF DELETE ON public.user_risk_profiles
  FOR EACH ROW EXECUTE FUNCTION public.user_risk_profiles_instead_of_delete();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_risk_profiles TO authenticated;
GRANT ALL ON public.user_risk_profiles TO service_role;

-- =============================================================================
-- (d) user_signals — new shared inbox
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('telegram', 'manual', 'tradingview')),
  symbol text NOT NULL,
  side text CHECK (side IS NULL OR side IN ('buy', 'sell', 'long', 'short')),
  entry numeric,
  sl numeric,
  tp numeric,
  raw_text text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'accepted', 'rejected', 'expired', 'executed')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS user_signals_user_created_idx
  ON public.user_signals (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_signals_user_status_idx
  ON public.user_signals (user_id, status, created_at DESC);

ALTER TABLE public.user_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_signals_select_own" ON public.user_signals;
CREATE POLICY "user_signals_select_own" ON public.user_signals
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_signals_insert_own" ON public.user_signals;
CREATE POLICY "user_signals_insert_own" ON public.user_signals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_signals_update_own" ON public.user_signals;
CREATE POLICY "user_signals_update_own" ON public.user_signals
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_signals_delete_own" ON public.user_signals;
CREATE POLICY "user_signals_delete_own" ON public.user_signals
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.user_signals FROM public;
REVOKE ALL ON TABLE public.user_signals FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_signals TO authenticated;
GRANT ALL ON TABLE public.user_signals TO service_role;

COMMENT ON TABLE public.user_signals IS
  'Shared signal inbox (telegram/manual/tradingview). RLS: own rows only. No auto-execution.';

COMMENT ON TABLE public.user_alerts IS
  'Canonical alerts for Companion + Trading OS. TOS name user_price_alerts is a compatibility view.';

COMMENT ON VIEW public.user_price_alerts IS
  'Compat view over user_alerts for Trading OS. Writable via INSTEAD OF triggers.';

COMMENT ON VIEW public.user_chart_preferences IS
  'Compat view over user_chart_states prefs marker rows (layout_id=prefs).';

COMMENT ON VIEW public.user_risk_profiles IS
  'Compat view over axe_user_rules where rule_type=risk_profile.';

COMMIT;
