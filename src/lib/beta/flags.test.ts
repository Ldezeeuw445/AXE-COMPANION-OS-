import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAccessBeta, hasEarlyBetaAccess } from "@/lib/beta/flags";

describe("beta flags by tier", () => {
  it("push_alerts for paid Companion plans", () => {
    assert.equal(canAccessBeta("push_alerts", "pro"), true);
    assert.equal(canAccessBeta("push_alerts", "founder"), true);
    assert.equal(canAccessBeta("push_alerts", "elite"), true);
    assert.equal(canAccessBeta("push_alerts", "free"), false);
  });

  it("closed betas for Founder/Elite only", () => {
    assert.equal(canAccessBeta("trading_os_bridge", "founder"), true);
    assert.equal(canAccessBeta("trading_os_bridge", "elite"), true);
    assert.equal(canAccessBeta("trading_os_bridge", "pro"), false);
    assert.equal(hasEarlyBetaAccess("founder"), true);
    assert.equal(hasEarlyBetaAccess("pro"), false);
  });
});
