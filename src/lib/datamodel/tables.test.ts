import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { CHART_PREFS_MARKER, TABLES } from "./tables";

const UNIFY_MIGRATION = "supabase/migrations/20261104190000_unify_shared_alerts_chart_risk_signals.sql";

describe("canonical tables", () => {
  it("keeps Companion on canonical names, TOS on compat names", () => {
    assert.equal(TABLES.alerts, "user_alerts");
    assert.equal(TABLES.alertsTosCompat, "user_price_alerts");
    assert.equal(TABLES.chartStates, "user_chart_states");
    assert.equal(TABLES.chartPreferencesCompat, "user_chart_preferences");
    assert.equal(TABLES.userRules, "axe_user_rules");
    assert.equal(TABLES.riskProfilesTosCompat, "user_risk_profiles");
    assert.equal(TABLES.signals, "user_signals");
  });

  it("uses stable prefs marker keys inside chart states", () => {
    assert.equal(CHART_PREFS_MARKER.layoutId, "prefs");
    assert.equal(CHART_PREFS_MARKER.workspaceId, "companion-prefs");
    assert.equal(CHART_PREFS_MARKER.timeframe, "*");
  });

  it("compat views use security_invoker and refuse cross-user writes", () => {
    const sql = readFileSync(resolve(process.cwd(), UNIFY_MIGRATION), "utf8");
    for (const view of [
      TABLES.alertsTosCompat,
      TABLES.chartPreferencesCompat,
      TABLES.riskProfilesTosCompat,
    ]) {
      const create = sql.indexOf(`CREATE OR REPLACE VIEW public.${view}`);
      assert.ok(create >= 0, `missing CREATE VIEW ${view}`);
      const nextCreate = sql.indexOf("CREATE OR REPLACE VIEW", create + 1);
      const slice = sql.slice(create, nextCreate === -1 ? sql.length : nextCreate);
      assert.match(
        slice,
        /WITH\s*\(\s*security_invoker\s*=\s*true\s*\)/i,
        `${view} must be created WITH (security_invoker = true)`,
      );
    }

    assert.match(sql, /compat_view_enforce_user_id/);
    assert.match(sql, /not allowed to write rows for another user/);

    for (const rel of [
      TABLES.alerts,
      TABLES.alertsTosCompat,
      "user_price_alerts_legacy",
      TABLES.chartStates,
      TABLES.chartPreferencesCompat,
      "user_chart_preferences_legacy",
      TABLES.userRules,
      TABLES.riskProfilesTosCompat,
      "user_risk_profiles_legacy",
      TABLES.signals,
    ]) {
      assert.ok(
        sql.includes(`REVOKE ALL ON TABLE public.${rel} FROM PUBLIC`) ||
          sql.includes(`REVOKE ALL ON TABLE public.%I FROM PUBLIC`),
        `must revoke PUBLIC on ${rel}`,
      );
      assert.ok(
        sql.includes(`REVOKE ALL ON TABLE public.${rel} FROM anon`) ||
          sql.includes(`REVOKE ALL ON TABLE public.%I FROM anon`),
        `must revoke anon on ${rel}`,
      );
    }
  });
});
