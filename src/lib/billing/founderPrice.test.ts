import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkoutTierForRequest,
  isEligibleForFounderPrice,
} from "@/lib/billing/founderPrice";

describe("founder price lock-in", () => {
  it("allows first-time (no badge)", () => {
    assert.equal(isEligibleForFounderPrice({ plan: "free", founderBadge: false }), true);
    assert.equal(isEligibleForFounderPrice({ plan: "pro", founderBadge: false }), true);
  });

  it("allows continuous founder subscription", () => {
    assert.equal(isEligibleForFounderPrice({ plan: "founder", founderBadge: true }), true);
  });

  it("blocks returning badge-holders from founder price", () => {
    assert.equal(isEligibleForFounderPrice({ plan: "free", founderBadge: true }), false);
    assert.equal(isEligibleForFounderPrice({ plan: "pro", founderBadge: true }), false);
    assert.equal(isEligibleForFounderPrice({ plan: "elite", founderBadge: true }), false);
  });

  it("remaps returning founder checkout to elite", () => {
    assert.equal(
      checkoutTierForRequest("founder", { plan: "free", founderBadge: true }),
      "elite",
    );
    assert.equal(
      checkoutTierForRequest("founder", { plan: "founder", founderBadge: true }),
      "founder",
    );
    assert.equal(
      checkoutTierForRequest("pro", { plan: "free", founderBadge: true }),
      "pro",
    );
  });
});
