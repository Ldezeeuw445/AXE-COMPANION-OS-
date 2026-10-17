import type { AxeFeature } from "@/lib/billing/features";

/**
 * Which paid feature each authenticated API route belongs to.
 *
 * Why this file exists: the tiers (free / Pro / Founder / Elite) were defined
 * with seventeen named features, and on 2026-10-11 exactly two of eighty-four
 * routes checked any of them. A price list is not a boundary — hiding a button
 * in the UI leaves the route wide open to anyone with a fetch call.
 *
 * Every authenticated route must appear in exactly one of the two maps below.
 * `verify-tier-gates.mjs` fails when a route is in neither, so a new route
 * cannot quietly default to free. Deciding which list it belongs in is a
 * product decision; leaving it undecided is a bug.
 */

/** Routes behind a paid feature, keyed by path under /api. */
export const PAID_ROUTE_FEATURES: Record<string, AxeFeature> = {
  "axe-journal": "full_auto_journal",
  "axe-memory": "advanced_memory",
  "adaptive/decisions": "advanced_memory",
  "adaptive/events": "advanced_memory",
  "adaptive/suggestions": "advanced_memory",
  "adaptive/suggestions/[id]": "advanced_memory",
  "chart/pending-actions": "chart_actions",
  "cockpit/briefing": "briefings",
  "cockpit/generate": "cockpit_learning",
  "cockpit/today": "cockpit_learning",
  "intel-chat": "advanced_intel",
  "intel-conviction": "advanced_intel",
  "intel-correlate": "advanced_intel",
  "intel-correlations": "advanced_intel",
  "risk/band": "account_health",
  "push/subscribe": "push_notifications",
  "push/test": "push_notifications",
  "alerts": "proactive_notifications",
};

/**
 * Authenticated routes that stay open on the free plan, each with the reason.
 *
 * The reason matters: "free" is a decision someone made, and a year from now
 * nobody will remember why. An empty reason is as bad as no entry.
 */
export const FREE_ROUTE_REASONS: Record<string, string> = {
  // The product has to be usable before anyone pays for it.
  "chat/messages": "Chat itself is free; volume is capped by chatQuota, not by a gate",
  "chat/messages/[id]/feedback": "Rating an answer must never cost money",
  "chat/quota": "Reading your own quota cannot require a plan",
  "chat/stream": "Chat itself is free; volume is capped by chatQuota",
  "chat/thread": "Reading your own conversation",
  "chat/tts": "Accessibility — reading aloud is not a premium feature",

  // The landing page's own form, posted by visitors who have no account at
  // all. Gating it behind a plan would mean nobody could ever reach one.
  waitlist: "Public landing-page signup; there is no user to charge yet",

  // Your own broker account and your own orders. Gating these would mean
  // charging a trader to reach their own money.
  "broker/hub": "The trader's own broker connection",
  "broker/symbol": "Symbol lookup on the trader's own broker",
  "mt5/order": "Placing an order on your own account",
  "mt5/modify-order": "Managing your own open orders",
  "mt5/modify-position": "Managing your own open positions",
  "mt5/close-position": "Closing your own position must never be blocked",
  "mt5/cancel-order": "Cancelling your own order must never be blocked",
  "alpaca/order": "Placing an order on your own account",
  "alpaca/modify-order": "Managing your own open orders",
  "alpaca/modify-position": "Managing your own open positions",
  "alpaca/provision": "Setting up your own paper account",
  "alpaca/reset": "Resetting your own paper account",
  "wallets": "Wallet connection",

  // Reading the app's own state.
  "alerts/[id]": "Editing an alert you already own",
  "alerts/[id]/trigger": "Firing an alert you already own",
  "chart/live": "Live price data — the chart must work for everyone",
  "chart/session": "Chart session state",
  "chart/snapshot": "Saving a chart image",
  "context": "Context the client needs to render anything at all",
  "feed": "The feed itself; its paid items are gated where they are produced",
  "market/context": "Market context for the chart",
  "quotes/prices": "Price quotes — the chart must work for everyone",
  "shell/status": "App shell status",
  "squawk/resolve": "Squawk station resolution",
  "vault/save-axe": "Saving an answer you already received",

  // Preferences are per-user settings, never a product tier.
  "preferences/alert-armed": "A user preference",
  "preferences/chart-theme": "A user preference",
  "preferences/favorite-workflows": "A user preference",
  "preferences/instant-sl-tp-modify": "A user preference",
  "preferences/squawk-stations": "A user preference",
  "preferences/trade-execution": "A user preference",

  // Account lifecycle and plumbing.
  "auth/demo": "Returns 410 — anonymous demo sessions were removed on 2026-10-11",
  "onboarding": "You cannot pay before you have onboarded",
  "push/status": "Reading whether push is on",
  "push/vapid": "The public VAPID key",
  "stripe/portal": "Managing your subscription must never need a subscription",
  "ai/desk": "Internal desk endpoint",
  "tools/call": "Tool dispatch; each tool enforces its own feature",
};

/** Route prefixes that are not user-facing and need no plan check. */
export const UNGATED_PREFIXES: readonly string[] = [
  "cron/", // CRON_SECRET
  "internal/", // service-to-service
  "debug/", // shape only, no user data
  "diagnostics/", // client error sink
  "webhooks/", // provider signature
  "stripe/webhook", // Stripe signature
  "push/send", // internal push dispatch
  "push/alert", // internal push dispatch
];

export function isUngatedPrefix(route: string): boolean {
  return UNGATED_PREFIXES.some((p) => route === p || route.startsWith(p));
}
