/**
 * Canonical shared Supabase table names (Companion ↔ Trading OS).
 * Compat views keep the old TOS names writable; Companion talks to canonicals.
 *
 * Schema: supabase/migrations/20261104190000_unify_shared_alerts_chart_risk_signals.sql
 * Do not change alert metadata / auto-trade (C7) semantics when renaming refs.
 */
export const TABLES = {
  /** Canonical alerts (absorbs TOS user_price_alerts). */
  alerts: "user_alerts",
  /** Compat view name — TOS only; Companion must not write here. */
  alertsTosCompat: "user_price_alerts",
  /** Canonical chart state + Companion prefs marker rows. */
  chartStates: "user_chart_states",
  /** Compat view over prefs marker rows (layout_id=prefs). */
  chartPreferencesCompat: "user_chart_preferences",
  /** Canonical risk rules (absorbs TOS user_risk_profiles). */
  userRules: "axe_user_rules",
  /** Compat view name — TOS only. */
  riskProfilesTosCompat: "user_risk_profiles",
  /** Shared signal inbox. */
  signals: "user_signals",
} as const;

/** Marker row that stores Companion chart prefs inside user_chart_states. */
export const CHART_PREFS_MARKER = {
  timeframe: "*",
  layoutId: "prefs",
  workspaceId: "companion-prefs",
} as const;

export type CanonicalTable = (typeof TABLES)[keyof typeof TABLES];
