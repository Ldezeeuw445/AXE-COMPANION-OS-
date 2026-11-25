import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pathAllowedWhileLocked, phoneAppLockedForPlan, showFreePhoneGate } from "./phoneAccess";

describe("Free is desk only on the phone app", () => {
  it("locks Free; Core and up, trials and exempt keep the app", () => {
    assert.equal(phoneAppLockedForPlan("free"), true);
    for (const plan of ["core", "pro", "founder", "elite", "exempt"] as const) {
      assert.equal(phoneAppLockedForPlan(plan), false, plan);
    }
    assert.equal(phoneAppLockedForPlan(null), false, "signed out is the auth gate's job");
  });

  it("a locked account can still upgrade, manage settings and get support", () => {
    assert.equal(pathAllowedWhileLocked("/upgrade"), true);
    assert.equal(pathAllowedWhileLocked("/upgrade/success?session_id=x"), true);
    assert.equal(pathAllowedWhileLocked("/settings/account"), true);
    assert.equal(pathAllowedWhileLocked("/support"), true);
    assert.equal(pathAllowedWhileLocked("/chat"), false);
    assert.equal(pathAllowedWhileLocked("/upgrades-fake"), false);
  });

  it("the gate shows only for Free on a locked page", () => {
    assert.equal(showFreePhoneGate("free", "/chat"), true);
    assert.equal(showFreePhoneGate("free", "/upgrade"), false);
    assert.equal(showFreePhoneGate("core", "/chat"), false);
  });
});
