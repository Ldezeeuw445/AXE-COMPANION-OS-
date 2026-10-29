-- Enforce pricing-page chat daily caps and keep quota RPCs aligned with entitlements.
-- Day boundary: UTC (same as prior axe_chat_* RPCs). Stated in API/UI as midnight UTC.
-- Caps: free 20, pro 200, founder 500, elite 500. chat_quota_exempt stays unlimited (-1).
-- Idempotent: CREATE IF NOT EXISTS + CREATE OR REPLACE.

CREATE TABLE IF NOT EXISTS public.axe_chat_usage_daily (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  user_messages integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

CREATE TABLE IF NOT EXISTS public.axe_chat_quota (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  used_today integer NOT NULL DEFAULT 0,
  quota_date date NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'utc')::date),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.axe_chat_quota ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own quota" ON public.axe_chat_quota;
CREATE POLICY "own quota" ON public.axe_chat_quota
  FOR ALL USING (user_id = auth.uid());

-- Resolve daily limit from axe_user_entitlements (billing source of truth).
CREATE OR REPLACE FUNCTION public.axe_chat_daily_limit(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pl text;
  pt timestamptz;
  exempt boolean;
BEGIN
  SELECT e.plan, e.pro_until, e.chat_quota_exempt
  INTO pl, pt, exempt
  FROM public.axe_user_entitlements e
  WHERE e.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN 20;
  END IF;

  IF exempt IS TRUE THEN
    RETURN -1;
  END IF;

  IF pl = 'elite' OR pl = 'founder' THEN
    RETURN 500;
  END IF;

  IF pl = 'pro' OR (pt IS NOT NULL AND pt > timezone('utc', now())) THEN
    RETURN 200;
  END IF;

  RETURN 20;
END;
$$;

CREATE OR REPLACE FUNCTION public.axe_chat_try_consume()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  lim integer;
  pl text;
  pt timestamptz;
  exempt boolean;
  used integer;
  new_used integer;
  today date := (timezone('utc', now()))::date;
  plan_out text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'limit', 20,
      'remaining', 0,
      'timezone', 'UTC'
    );
  END IF;

  SELECT e.plan, e.pro_until, e.chat_quota_exempt
  INTO pl, pt, exempt
  FROM public.axe_user_entitlements e
  WHERE e.user_id = uid;

  IF NOT FOUND THEN
    pl := 'free';
    pt := NULL;
    exempt := false;
  END IF;

  lim := public.axe_chat_daily_limit(uid);

  IF exempt IS TRUE THEN
    plan_out := 'exempt';
  ELSIF pl = 'elite' THEN
    plan_out := 'elite';
  ELSIF pl = 'founder' THEN
    plan_out := 'founder';
  ELSIF pl = 'pro' OR (pt IS NOT NULL AND pt > timezone('utc', now())) THEN
    plan_out := 'pro';
  ELSE
    plan_out := 'free';
  END IF;

  -- Unlimited (staff exempt only)
  IF lim = -1 THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'unlimited',
      'plan', plan_out,
      'limit', -1,
      'used', 0,
      'remaining', -1,
      'timezone', 'UTC'
    );
  END IF;

  INSERT INTO public.axe_chat_usage_daily (user_id, usage_date, user_messages)
  VALUES (uid, today, 0)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  -- Keep legacy single-row quota table in sync for any older readers.
  INSERT INTO public.axe_chat_quota (user_id, used_today, quota_date)
  VALUES (uid, 0, today)
  ON CONFLICT (user_id) DO UPDATE
    SET used_today = CASE
          WHEN axe_chat_quota.quota_date < today THEN 0
          ELSE axe_chat_quota.used_today
        END,
        quota_date = today;

  SELECT d.user_messages INTO used
  FROM public.axe_chat_usage_daily d
  WHERE d.user_id = uid AND d.usage_date = today
  FOR UPDATE;

  IF COALESCE(used, 0) >= lim THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'daily_limit',
      'plan', plan_out,
      'limit', lim,
      'used', COALESCE(used, 0),
      'remaining', 0,
      'timezone', 'UTC'
    );
  END IF;

  UPDATE public.axe_chat_usage_daily d
  SET user_messages = d.user_messages + 1
  WHERE d.user_id = uid AND d.usage_date = today
  RETURNING d.user_messages INTO new_used;

  UPDATE public.axe_chat_quota
  SET used_today = new_used, quota_date = today, updated_at = now()
  WHERE user_id = uid;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', 'ok',
    'plan', plan_out,
    'limit', lim,
    'used', new_used,
    'remaining', GREATEST(0, lim - new_used),
    'timezone', 'UTC'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.axe_chat_quota_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  lim integer;
  pl text;
  pt timestamptz;
  exempt boolean;
  used integer := 0;
  today date := (timezone('utc', now()))::date;
  plan_out text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT e.plan, e.pro_until, e.chat_quota_exempt
  INTO pl, pt, exempt
  FROM public.axe_user_entitlements e
  WHERE e.user_id = uid;

  IF NOT FOUND THEN
    pl := 'free';
    pt := NULL;
    exempt := false;
  END IF;

  lim := public.axe_chat_daily_limit(uid);

  IF exempt IS TRUE THEN
    plan_out := 'exempt';
  ELSIF pl = 'elite' THEN
    plan_out := 'elite';
  ELSIF pl = 'founder' THEN
    plan_out := 'founder';
  ELSIF pl = 'pro' OR (pt IS NOT NULL AND pt > timezone('utc', now())) THEN
    plan_out := 'pro';
  ELSE
    plan_out := 'free';
  END IF;

  IF lim = -1 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'plan', plan_out,
      'limit', -1,
      'used', 0,
      'remaining', -1,
      'skipped', false,
      'timezone', 'UTC'
    );
  END IF;

  SELECT COALESCE(
    (SELECT d.user_messages
     FROM public.axe_chat_usage_daily d
     WHERE d.user_id = uid AND d.usage_date = today),
    0
  ) INTO used;

  RETURN jsonb_build_object(
    'ok', true,
    'plan', plan_out,
    'limit', lim,
    'used', used,
    'remaining', GREATEST(0, lim - used),
    'skipped', false,
    'timezone', 'UTC'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.axe_chat_refund()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  new_used integer;
  today date := (timezone('utc', now()))::date;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  UPDATE public.axe_chat_usage_daily d
  SET user_messages = GREATEST(0, d.user_messages - 1)
  WHERE d.user_id = uid AND d.usage_date = today
  RETURNING d.user_messages INTO new_used;

  IF FOUND THEN
    UPDATE public.axe_chat_quota
    SET used_today = new_used, quota_date = today, updated_at = now()
    WHERE user_id = uid;
    RETURN jsonb_build_object('ok', true, 'used', new_used);
  END IF;

  -- Fallback: older single-row table only
  UPDATE public.axe_chat_quota
  SET used_today = GREATEST(used_today - 1, 0), updated_at = now()
  WHERE user_id = uid AND quota_date = today
  RETURNING used_today INTO new_used;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'used', new_used);
  END IF;

  RETURN jsonb_build_object('ok', true, 'used', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.axe_chat_daily_limit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.axe_chat_try_consume() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.axe_chat_quota_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.axe_chat_refund() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.axe_chat_daily_limit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.axe_chat_try_consume() TO authenticated;
GRANT EXECUTE ON FUNCTION public.axe_chat_quota_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.axe_chat_refund() TO authenticated;

GRANT EXECUTE ON FUNCTION public.axe_chat_daily_limit(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.axe_chat_try_consume() TO service_role;
GRANT EXECUTE ON FUNCTION public.axe_chat_quota_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.axe_chat_refund() TO service_role;
