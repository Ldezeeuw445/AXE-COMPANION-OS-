-- Core tier (€29): plan = 'core' on axe_user_entitlements.
--
-- Core is metered: 50 AXE chat sends per UTC day (Free 20, Pro 200,
-- Founder/Elite 500, chat_quota_exempt unlimited — unchanged). A running
-- pro_until on a core row still counts as Pro, the same order as before.
--
-- 1. The plan check allows 'core'. Production already has this (applied from
--    Trading OS migration 20261122120000); repeated here so a fresh database
--    gets the same constraint.
-- 2. axe_chat_daily_limit / axe_chat_try_consume / axe_chat_quota_status are
--    the versions from 20261029170000 (checked identical to production on
--    2026-11-22) with one 'core' branch each. Grants are unchanged by
--    CREATE OR REPLACE.
-- 3. axe_plan_is_paid includes 'core' (nothing in production calls it today).
--
-- Idempotent.

BEGIN;

ALTER TABLE public.axe_user_entitlements
  DROP CONSTRAINT IF EXISTS axe_user_entitlements_plan_check;
ALTER TABLE public.axe_user_entitlements
  ADD CONSTRAINT axe_user_entitlements_plan_check
  CHECK (plan = ANY (ARRAY['free'::text, 'core'::text, 'pro'::text, 'founder'::text, 'elite'::text]));

CREATE OR REPLACE FUNCTION public.axe_plan_is_paid(pl text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT pl IN ('core', 'pro', 'founder', 'elite');
$$;

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

  IF pl = 'core' THEN
    RETURN 50;
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
  ELSIF pl = 'core' THEN
    plan_out := 'core';
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
  ELSIF pl = 'core' THEN
    plan_out := 'core';
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

COMMIT;
