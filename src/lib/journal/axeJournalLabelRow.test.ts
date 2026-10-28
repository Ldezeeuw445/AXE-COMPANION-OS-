import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAxeJournalLabelRow } from "./axeJournalLabelRow";

describe("buildAxeJournalLabelRow", () => {
  it("copies a known AXE tag into the NOT NULL label column", () => {
    const row = buildAxeJournalLabelRow({
      userId: "u1",
      tradeId: "t1",
      accountId: "a1",
      axeLabel: "Impatient",
      axeNote: "Closed too early",
      alignmentScore: 42,
      breakdown: { rule_adherence: 10 },
    });
    assert.equal(row.label, "Impatient");
    assert.equal(row.axe_label, "Impatient");
    assert.equal(row.user_id, "u1");
    assert.equal(row.trade_id, "t1");
    assert.equal(row.account_id, "a1");
    assert.equal(row.alignment_score, 42);
  });

  it("falls back to OK when the model invents a tag the CHECK would reject", () => {
    const row = buildAxeJournalLabelRow({
      userId: "u1",
      tradeId: "t1",
      accountId: "a1",
      axeLabel: "EmotionalWreck",
      axeNote: "n/a",
      alignmentScore: 10,
      breakdown: null,
    });
    assert.equal(row.label, "OK");
    assert.equal(row.axe_label, "OK");
  });
});
