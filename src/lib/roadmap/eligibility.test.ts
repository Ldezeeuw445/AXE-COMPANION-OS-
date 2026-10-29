import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canVoteOnRoadmap } from "@/lib/roadmap/eligibility";

describe("roadmap voting", () => {
  it("is Founder (plan or badge)", () => {
    assert.equal(canVoteOnRoadmap("founder", false), true);
    assert.equal(canVoteOnRoadmap("free", true), true);
    assert.equal(canVoteOnRoadmap("elite", false), false);
    assert.equal(canVoteOnRoadmap("pro", false), false);
  });
});
