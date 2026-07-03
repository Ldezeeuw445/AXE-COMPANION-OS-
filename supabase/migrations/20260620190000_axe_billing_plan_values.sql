-- Allow founder and elite plan values on entitlements.

ALTER TABLE public.axe_user_entitlements
  DROP CONSTRAINT IF EXISTS axe_user_entitlements_plan_check;

ALTER TABLE public.axe_user_entitlements
  ADD CONSTRAINT axe_user_entitlements_plan_check
  CHECK (plan IN ('free', 'pro', 'founder', 'elite'));
