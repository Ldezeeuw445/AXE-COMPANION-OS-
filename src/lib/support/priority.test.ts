import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareSupportTicketsForAdmin,
  isPrioritySupportPlan,
} from "@/lib/support/priority";

describe("priority support", () => {
  it("flags Founder and Elite only", () => {
    assert.equal(isPrioritySupportPlan("founder"), true);
    assert.equal(isPrioritySupportPlan("elite"), true);
    assert.equal(isPrioritySupportPlan("pro"), false);
    assert.equal(isPrioritySupportPlan("free"), false);
  });

  it("sorts priority first then newest", () => {
    const rows = [
      { priority: false, created_at: "2026-10-29T12:00:00Z" },
      { priority: true, created_at: "2026-10-28T12:00:00Z" },
      { priority: true, created_at: "2026-10-29T10:00:00Z" },
    ];
    const sorted = [...rows].sort(compareSupportTicketsForAdmin);
    assert.equal(sorted[0].priority, true);
    assert.equal(sorted[0].created_at, "2026-10-29T10:00:00Z");
    assert.equal(sorted[1].priority, true);
    assert.equal(sorted[2].priority, false);
  });
});
