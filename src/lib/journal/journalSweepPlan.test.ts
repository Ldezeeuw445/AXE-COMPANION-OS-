import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chunkIds, planJournalSweep } from "./journalSweepPlan";

describe("planJournalSweep", () => {
  const rows = [
    { id: "t1", user_id: "u1", account_id: "a1" },
    { id: "t2", user_id: "u1", account_id: "a1" },
    { id: "t3", user_id: "u1", account_id: "a2" },
    { id: "t4", user_id: "u2", account_id: "a3" },
    { id: null, user_id: "u2", account_id: "a3" },
    { id: "t5", user_id: null, account_id: "a3" },
  ];

  it("groups pending trades per account and skips labeled ones", () => {
    const { targets, pendingTrades } = planJournalSweep(rows, new Set(["t2", "t4"]));
    assert.equal(pendingTrades, 2);
    assert.deepEqual(targets, [
      { userId: "u1", accountId: "a1", tradeIds: ["t1"] },
      { userId: "u1", accountId: "a2", tradeIds: ["t3"] },
    ]);
  });

  it("drops accounts whose trades are all labeled", () => {
    const { targets } = planJournalSweep(rows, new Set(["t1", "t2", "t3", "t4"]));
    assert.deepEqual(targets, []);
  });

  it("caps trade ids per account but still counts all pending", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, user_id: "u", account_id: "a" }));
    const { targets, pendingTrades } = planJournalSweep(many, new Set(), 20);
    assert.equal(pendingTrades, 30);
    assert.equal(targets[0].tradeIds.length, 20);
    assert.equal(targets[0].tradeIds[0], "x0");
  });

  it("ignores duplicate trade rows", () => {
    const dup = [rows[0], rows[0]];
    assert.deepEqual(planJournalSweep(dup, new Set()).targets[0].tradeIds, ["t1"]);
  });
});

describe("chunkIds", () => {
  it("splits into fixed-size chunks", () => {
    assert.deepEqual(chunkIds(["a", "b", "c"], 2), [["a", "b"], ["c"]]);
    assert.deepEqual(chunkIds([], 2), []);
  });
});
