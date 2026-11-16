-- An anonymous auth user can never hold a paid entitlement.
--
-- Why: until 2026-10-11 POST /api/auth/demo minted anonymous users and wrote
-- plan='founder', founder_badge=true, chat_quota_exempt=true for them (51 such
-- rows were created on 2026-09-11 by a pre-fix build). The app now treats
-- anonymous sessions as Free (entitlementCore.applyAnonymousRule) and the
-- rows were reset, but the chat RPCs (axe_chat_daily_limit / axe_chat_try_consume)
-- read this table directly, so an anonymous JWT could still have been granted
-- unlimited chat by any future bad write. This makes the table itself refuse.
--
-- Behaviour: BEFORE INSERT OR UPDATE, when the row's user is is_anonymous=true,
-- force plan='free', founder_badge=false, chat_quota_exempt=false, pro_until=NULL
-- (a future pro_until on a free plan is a Pro trial, so it is cleared too).
-- Writes are never rejected — they are normalised — so a webhook or job that
-- writes for an anonymous user cannot fail and be retried forever.
--
-- Idempotent. Existing rows are not touched by this migration (checked: 0 rows
-- violate it at the time of writing).

CREATE OR REPLACE FUNCTION public.axe_entitlements_anonymous_free()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  anon boolean;
BEGIN
  SELECT u.is_anonymous INTO anon FROM auth.users u WHERE u.id = NEW.user_id;
  IF anon IS TRUE THEN
    NEW.plan := 'free';
    NEW.founder_badge := false;
    NEW.chat_quota_exempt := false;
    NEW.pro_until := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.axe_entitlements_anonymous_free() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_axe_entitlements_anonymous_free ON public.axe_user_entitlements;
CREATE TRIGGER trg_axe_entitlements_anonymous_free
  BEFORE INSERT OR UPDATE ON public.axe_user_entitlements
  FOR EACH ROW
  EXECUTE FUNCTION public.axe_entitlements_anonymous_free();

COMMENT ON TRIGGER trg_axe_entitlements_anonymous_free ON public.axe_user_entitlements IS
  'Anonymous auth users are always free: plan=free, no badge, no chat exemption, no pro_until.';
