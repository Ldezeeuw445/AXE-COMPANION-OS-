-- Founder seat cap: owner/staff (chat_quota_exempt) do not consume commercial spots.
-- Chat quota: permanent founder_badge keeps unlimited chat after subscription cancel.

CREATE OR REPLACE FUNCTION public.axe_founder_seats_used()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.axe_user_entitlements
  WHERE founder_badge IS TRUE
    AND chat_quota_exempt IS NOT TRUE;
$$;

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
  exempt boolean;
  badge boolean;
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

  SELECT e.plan, e.pro_until, e.chat_quota_exempt, e.founder_badge
  INTO pl, pt, exempt, badge
  FROM public.axe_user_entitlements e
  WHERE e.user_id = uid;

  IF NOT FOUND THEN
    pl := 'free';
    pt := NULL;
    exempt := false;
    badge := false;
  END IF;

  IF exempt IS TRUE OR badge IS TRUE THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'plan', CASE WHEN badge THEN 'founder' ELSE 'exempt' END,
      'limit', lim,
      'remaining', -1
    );
  END IF;

  IF public.axe_plan_is_paid(pl) OR (pt IS NOT NULL AND pt > timezone('utc', now())) THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'plan', COALESCE(pl, 'pro'),
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
  exempt boolean;
  badge boolean;
  used int;
  today date := (timezone('utc', now()))::date;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT e.plan, e.pro_until, e.chat_quota_exempt, e.founder_badge
  INTO pl, pt, exempt, badge
  FROM public.axe_user_entitlements e
  WHERE e.user_id = uid;

  IF NOT FOUND THEN
    pl := 'free';
    pt := NULL;
    exempt := false;
    badge := false;
  END IF;

  IF exempt IS TRUE OR badge IS TRUE THEN
    RETURN jsonb_build_object(
      'ok', true,
      'plan', CASE WHEN badge THEN 'founder' ELSE 'exempt' END,
      'limit', lim,
      'used', 0,
      'remaining', -1
    );
  END IF;

  IF public.axe_plan_is_paid(pl) OR (pt IS NOT NULL AND pt > timezone('utc', now())) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'plan', COALESCE(pl, 'pro'),
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
