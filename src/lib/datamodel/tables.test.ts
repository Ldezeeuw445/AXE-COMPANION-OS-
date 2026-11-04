import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHART_PREFS_MARKER, TABLES } from "./tables";

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
});
