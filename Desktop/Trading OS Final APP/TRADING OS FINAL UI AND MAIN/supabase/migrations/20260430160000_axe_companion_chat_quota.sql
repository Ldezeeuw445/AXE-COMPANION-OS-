-- AXE Companion: Free tier daily chat sends (default 20 UTC) + Pro entitlements.
-- Consumption is atomic (row lock). Only SECURITY DEFINER functions touch usage rows.

CREATE TABLE IF NOT EXISTS public.axe_user_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  stripe_customer_id text,
  stripe_subscription_id text,
  pro_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.axe_chat_usage_daily (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  user_messages int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date),
  CONSTRAINT axe_chat_usage_daily_count_nonneg CHECK (user_messages >= 0)
);

CREATE INDEX IF NOT EXISTS axe_chat_usage_daily_user_date_idx
  ON public.axe_chat_usage_daily (user_id, usage_date DESC);

ALTER TABLE public.axe_user_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.axe_chat_usage_daily ENABLE ROW LEVEL SECURITY;
-- usage_daily: RLS on, no policies → no direct access for authenticated (RPC + service_role only).

DROP POLICY IF EXISTS "axe_user_entitlements_select_own" ON public.axe_user_entitlements;
CREATE POLICY "axe_user_entitlements_select_own" ON public.axe_user_entitlements
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.axe_chat_usage_daily FROM PUBLIC;
REVOKE ALL ON public.axe_chat_usage_daily FROM authenticated;
GRANT SELECT ON public.axe_user_entitlements TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.axe_user_entitlements FROM authenticated;

-- -------------------------------------------------------------------
-- axe_chat_try_consume: call once per user Send before persisting message / OpenAI.
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.axe_chat_try_consume()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  lim int := 20;
  pl text;
  pt timestamptz;
  used int;
  new_used int;
  today date := (timezone('utc', now()))::date;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'limit', lim,
      'remaining', 0
    );
  END IF;

  SELECT e.plan, e.pro_until INTO pl, pt
  FROM public.axe_user_entitlements e
  WHERE e.user_id = uid;

  IF NOT FOUND THEN
    pl := 'free';
    pt := NULL;
  END IF;

  IF pl = 'pro' OR (pt IS NOT NULL AND pt > timezone('utc', now())) THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'plan', 'pro',
      'limit', lim,
      'remaining', -1
    );
  END IF;

  INSERT INTO public.axe_chat_usage_daily (user_id, usage_date, user_messages)
  VALUES (uid, today, 0)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  SELECT d.user_messages INTO used
  FROM public.axe_chat_usage_daily d
  WHERE d.user_id = uid AND d.usage_date = today
  FOR UPDATE;

  IF COALESCE(used, 0) >= lim THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'plan', 'free',
      'limit', lim,
      'used', COALESCE(used, 0),
      'remaining', 0,
      'reason', 'daily_limit'
    );
  END IF;

  UPDATE public.axe_chat_usage_daily d
  SET user_messages = d.user_messages + 1
  WHERE d.user_id = uid AND d.usage_date = today
  RETURNING d.user_messages INTO new_used;

  RETURN jsonb_build_object(
    'allowed', true,
    'plan', 'free',
    'limit', lim,
    'used', new_used,
    'remaining', GREATEST(0, lim - new_used)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.axe_chat_try_consume() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.axe_chat_try_consume() TO authenticated;
GRANT EXECUTE ON FUNCTION public.axe_chat_try_consume() TO service_role;

-- -------------------------------------------------------------------
-- axe_chat_quota_status: read-only for UI (no increment).
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.axe_chat_quota_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  lim int := 20;
  pl text;
  pt timestamptz;
  used int;
  today date := (timezone('utc', now()))::date;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT e.plan, e.pro_until INTO pl, pt
  FROM public.axe_user_entitlements e
  WHERE e.user_id = uid;

  IF NOT FOUND THEN
    pl := 'free';
    pt := NULL;
  END IF;

  IF pl = 'pro' OR (pt IS NOT NULL AND pt > timezone('utc', now())) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'plan', 'pro',
      'limit', lim,
      'used', 0,
      'remaining', -1
    );
  END IF;

  SELECT d.user_messages INTO used
  FROM public.axe_chat_usage_daily d
  WHERE d.user_id = uid AND d.usage_date = today;

  RETURN jsonb_build_object(
    'ok', true,
    'plan', 'free',
    'limit', lim,
    'used', COALESCE(used, 0),
    'remaining', GREATEST(0, lim - COALESCE(used, 0))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.axe_chat_quota_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.axe_chat_quota_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.axe_chat_quota_status() TO service_role;
