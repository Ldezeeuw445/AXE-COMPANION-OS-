import type { AxePlanId } from "@/lib/billing/tiers";

/**
 * Free is desk only (Luka, 2026-11-22): on AXE Companion a Free account can sign
 * in, see its account and upgrade, and nothing else. Core and up, an active
 * pro_until trial, and the owner allow-list (featurePlanForEntitlement → founder)
 * get the whole app. Signed-out visitors are handled by the existing auth gate.
 */
export const FREE_PHONE_ALLOWED_PATHS = [
  "/upgrade",
  "/settings",
  "/support",
  "/feedback",
  "/roadmap",
  "/onboarding",
] as const;

export function phoneAppLockedForPlan(featurePlan: AxePlanId | "exempt" | null | undefined): boolean {
  return featurePlan === "free";
}

export function pathAllowedWhileLocked(pathname: string | null | undefined): boolean {
  const path = (pathname ?? "").split("?")[0] || "/";
  return FREE_PHONE_ALLOWED_PATHS.some((root) => path === root || path.startsWith(`${root}/`));
}

export function showFreePhoneGate(
  featurePlan: AxePlanId | "exempt" | null | undefined,
  pathname: string | null | undefined,
): boolean {
  return phoneAppLockedForPlan(featurePlan) && !pathAllowedWhileLocked(pathname);
}
