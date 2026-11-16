import type { AxeFeature } from "@/lib/billing/features";

/**
 * Where each advertised paid feature is actually enforced.
 *
 * `routeFeatures.ts` answers "which routes are gated". This answers the
 * question one level up: for each feature on the pricing page, what stops a
 * Free user from using it with a direct call? A feature with no entry here, or
 * an entry whose file no longer mentions the feature, fails
 * `scripts/verify-feature-enforcement.mjs` — so a feature cannot be advertised
 * and quietly stay unenforced.
 *
 * Three honest states:
 *  - "server":      one or more server files check the feature (`files`).
 *  - "shared":      no surface of its own; enforced through another feature.
 *  - "client-only": cannot be enforced on a server; the reason is written down.
 */
export type FeatureEnforcement =
  | { status: "server"; files: string[]; marker?: string }
  | { status: "shared"; via: AxeFeature; note: string }
  | { status: "client-only"; note: string };

export const FEATURE_ENFORCEMENT: Record<AxeFeature, FeatureEnforcement> = {
  unlimited_chat: {
    status: "server",
    files: ["supabase/migrations/20261029170000_enforce_plan_chat_and_live_caps.sql"],
    marker: "axe_chat_try_consume",
  },
  cockpit_learning: {
    status: "server",
    files: ["src/app/api/cockpit/today/route.ts", "src/app/api/cockpit/generate/route.ts"],
  },
  learning_arc: {
    status: "server",
    files: ["src/lib/journal/loadJournalPageData.ts"],
  },
  trade_preparation: { status: "server", files: ["src/services/axeToolHandlers.ts"] },
  chart_actions: {
    status: "server",
    files: ["src/app/api/chart/pending-actions/route.ts", "src/services/axeToolHandlers.ts"],
  },
  proactive_notifications: {
    status: "server",
    files: ["src/app/api/alerts/route.ts", "src/services/axeProactiveWatcher.ts"],
  },
  push_notifications: {
    status: "server",
    files: ["src/app/api/push/subscribe/route.ts", "src/app/api/push/test/route.ts"],
  },
  advanced_memory: {
    status: "server",
    files: ["src/app/api/axe-memory/route.ts", "src/app/api/adaptive/suggestions/route.ts"],
  },
  vector_rag_memory: {
    status: "shared",
    via: "advanced_memory",
    note:
      "No surface of its own: the user's stored memory is only readable through the advanced_memory routes. " +
      "Chat's curated knowledge layer is still Free — an open product question, not a gate.",
  },
  multi_account: {
    status: "server",
    files: ["src/app/actions/mt5Cloud.ts"],
    marker: "canConnectLiveAccount",
  },
  full_auto_journal: { status: "server", files: ["src/app/api/axe-journal/route.ts"] },
  full_indicators: {
    status: "client-only",
    note:
      "Indicator math runs in the browser over price data that is Free; the only gate is the server-rendered " +
      "flag in chart/page.tsx. AI-routed indicator changes are server-gated under chart_actions.",
  },
  advanced_intel: { status: "server", files: ["src/app/api/intel-chat/route.ts", "src/app/api/intel-correlate/route.ts"] },
  account_health: { status: "server", files: ["src/app/api/risk/band/route.ts"] },
  briefings: {
    status: "server",
    files: ["src/app/api/cockpit/briefing/route.ts", "src/services/axeDailyBriefingService.ts"],
  },
  pair_awareness: {
    status: "shared",
    via: "trading_space_context",
    note: "Per-pair history is part of the trading-space block, which is dropped for Free in axeContextBuilder.",
  },
  trading_space_context: { status: "server", files: ["src/services/axeContextBuilder.ts"] },
};
