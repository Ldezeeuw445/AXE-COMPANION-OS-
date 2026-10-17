/**
 * Server-triggered push categories for PHASE C6.
 *
 * Each category is independently opt-in. Defaults are ON so existing
 * subscribers keep receiving the alerts they already granted.
 */

export const PUSH_CATEGORIES = [
  "price_alert",
  "risk_alert",
  "broker_disconnect",
  "economic_event",
  "axe_finding",
] as const;

export type PushCategory = (typeof PUSH_CATEGORIES)[number];

export const PUSH_CATEGORY_LABELS: Record<PushCategory, string> = {
  price_alert: "Price alerts",
  risk_alert: "Risk alerts",
  broker_disconnect: "Account / broker disconnect",
  economic_event: "High-impact economic events",
  axe_finding: "AXE findings",
};

export const PUSH_CATEGORY_HINTS: Record<PushCategory, string> = {
  price_alert: "A watched pair crosses the level you set.",
  risk_alert: "Concentration, weekend exposure, or a rule that would hurt this account.",
  broker_disconnect: "The broker feed went silent or the connection failed.",
  economic_event: "A high-impact calendar print is coming up on a pair you trade.",
  axe_finding: "AXE spotted something in your journal or a chat thread.",
};

export const PUSH_CATEGORY_SEVERITY: Record<PushCategory, "info" | "alert" | "risk"> = {
  price_alert: "alert",
  risk_alert: "risk",
  broker_disconnect: "risk",
  economic_event: "alert",
  axe_finding: "info",
};

/** Cooldown per user+event_key. Same event cannot fire again inside the window. */
export const PUSH_CATEGORY_COOLDOWN_MS: Record<PushCategory, number> = {
  price_alert: 60_000,
  risk_alert: 60 * 60_000,
  broker_disconnect: 24 * 60 * 60_000,
  economic_event: 6 * 60 * 60_000,
  axe_finding: 24 * 60 * 60_000,
};

export function isPushCategory(value: unknown): value is PushCategory {
  return typeof value === "string" && (PUSH_CATEGORIES as readonly string[]).includes(value);
}
