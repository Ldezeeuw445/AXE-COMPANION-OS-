import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySessionAccount, buildQuickJournalDraft, directionLabel } from "./quickJournalDraft";
import { DEFAULT_ACTIVE_SESSION } from "../session/activeSession";

const trade = {
  id: "tr-1",
  accountId: "acct-live",
  symbol: "xauusd",
  side: "sell",
  volume: 0.2,
  openPrice: 2650.4,
  closePrice: 2642.1,
  openTime: "2026-10-17T08:00:00.000Z",
  closeTime: "2026-10-17T09:12:00.000Z",
  pnl: 166,
  fees: -4.2,
  label: "Good" as const,
  note: null,
  axe_label: "Followed plan",
  axe_note: "Cut at the level you marked.",
  alignment_score: 82,
  axe_journal: { explanation: "Same playbook as the London fade." },
};

describe("quickJournalDraft", () => {
  it("prefills symbol, direction, entry/exit, net P&L and the AXE draft", () => {
    const draft = buildQuickJournalDraft(trade, {
      ...DEFAULT_ACTIVE_SESSION,
      accountId: "acct-live",
      accountLabel: "IC Markets Live",
      accountType: "live",
    });
    assert.equal(draft.symbol, "XAUUSD");
    assert.equal(directionLabel(draft.side), "Sell");
    assert.equal(draft.openPrice, 2650.4);
    assert.equal(draft.closePrice, 2642.1);
    assert.equal(draft.netPnl, 161.8);
    assert.equal(draft.accountLabel, "IC Markets Live");
    assert.equal(draft.axe.axeLabel, "Followed plan");
    assert.equal(draft.axe.explanation, "Same playbook as the London fade.");
  });

  it("does not paste another account's label onto a different trade", () => {
    const draft = buildQuickJournalDraft(trade, {
      ...DEFAULT_ACTIVE_SESSION,
      accountId: "acct-other",
      accountLabel: "FTMO Funded",
      accountType: "funded",
    });
    assert.equal(draft.accountId, "acct-live");
    assert.equal(draft.accountLabel, null);
  });

  it("applySessionAccount only fills when the ids match", () => {
    const draft = buildQuickJournalDraft(trade);
    const patched = applySessionAccount(draft, {
      accountId: "acct-live",
      accountLabel: "IC Markets Live",
      accountType: "live",
    });
    assert.equal(patched.accountLabel, "IC Markets Live");
    const ignored = applySessionAccount(draft, {
      accountId: "acct-other",
      accountLabel: "Nope",
      accountType: "demo",
    });
    assert.equal(ignored.accountLabel, null);
  });
});
