-- Refund one free-tier daily chat slot for the calling user (UTC day).
-- Used when a send was reserved via axe_chat_try_consume() but ultimately
-- produced no AXE reply (e.g. the OpenAI call failed), so the user is not
-- charged for a message they never received.
--
-- Mirrors the SECURITY DEFINER pattern of axe_chat_try_consume(), but is
-- restricted to authenticated users only (not anon).

CREATE OR REPLACE FUNCTION public.axe_chat_refund()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  new_used int;
  today date := (timezone('utc', now()))::date;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  UPDATE public.axe_chat_usage_daily d
  SET user_messages = GREATEST(0, d.user_messages - 1)
  WHERE d.user_id = uid AND d.usage_date = today
  RETURNING d.user_messages INTO new_used;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'used', 0);
  END IF;

  RETURN jsonb_build_object('ok', true, 'used', new_used);
END;
$$;

-- Keep this SECURITY DEFINER function off the anon role (only signed-in users
-- can refund their own quota).
REVOKE ALL ON FUNCTION public.axe_chat_refund() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.axe_chat_refund() FROM anon;
GRANT EXECUTE ON FUNCTION public.axe_chat_refund() TO authenticated;
