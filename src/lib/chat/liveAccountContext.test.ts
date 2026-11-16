import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LIVE_ACCOUNT_MAX_AGE_SECONDS,
  formatAccountAge,
  liveAccountPromptBlock,
  pickLiveAccountContext,
  snapshotFromLiveState,
} from "./liveAccountContext";

const NOW = new Date("2026-11-16T18:00:00Z");
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString();

function row(id: string, updatedSecondsAgo: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    label: `Acc ${id}`,
    mt5_server: "Srv",
    metadata: {
      accountSummary: { leverage: 100 },
      liveAccountState: { balance: 1000, equity: 990, margin: 10, freeMargin: 980, currency: "USD", updatedAt: ago(updatedSecondsAgo), ...extra },
    },
  };
}

describe("AXE-chat live_account", () => {
  it("maps liveAccountState onto the Mt5AccountSnapshot shape", () => {
    const s = snapshotFromLiveState(row("a", 30), NOW)!;
    assert.deepEqual(
      Object.keys(s).sort(),
      ["account_id", "age_seconds", "balance", "currency", "equity", "free_margin", "leverage", "margin", "name", "server", "source", "stale", "updated_at"],
    );
    assert.equal(s.balance, 1000);
    assert.equal(s.free_margin, 980);
    assert.equal(s.leverage, 100);
    assert.equal(s.age_seconds, 30);
    assert.equal(s.stale, false);
    assert.equal(s.source, "live_account_state");
  });

  it("fresh state is live_account", () => {
    const r = pickLiveAccountContext({ accounts: [row("a", 120)], now: NOW });
    assert.equal(r.live?.account_id, "a");
    assert.equal(r.lastKnown, null);
  });

  it("state older than the limit is never live_account — it is last known, stale", () => {
    const r = pickLiveAccountContext({ accounts: [row("a", LIVE_ACCOUNT_MAX_AGE_SECONDS + 60)], now: NOW });
    assert.equal(r.live, null);
    assert.equal(r.lastKnown?.stale, true);
  });

  it("a four-day-old state (the 2026-11-12 outage) is not live", () => {
    const r = pickLiveAccountContext({ accounts: [row("a", 4 * 86400)], now: NOW });
    assert.equal(r.live, null);
    assert.equal(r.lastKnown?.age_seconds, 4 * 86400);
  });

  it("the old snapshots table row from April is never live", () => {
    const legacy = {
      account_id: "old", balance: 50000, equity: 50000, margin: 0, free_margin: 50000, leverage: 100,
      currency: "USD", server: "x", name: "old", updated_at: "2026-04-21T10:00:00Z",
    };
    const r = pickLiveAccountContext({ accounts: [], legacySnapshot: legacy, now: NOW });
    assert.equal(r.live, null);
    assert.equal(r.lastKnown?.stale, true);
    assert.equal(r.lastKnown?.source, "mt5_account_snapshots");
  });

  it("fresh live state beats an older snapshots row", () => {
    const legacy = {
      account_id: "old", balance: 1, equity: 1, margin: 0, free_margin: 1, leverage: 1,
      currency: "USD", server: "x", name: "old", updated_at: "2026-04-21T10:00:00Z",
    };
    const r = pickLiveAccountContext({ accounts: [row("a", 60)], legacySnapshot: legacy, now: NOW });
    assert.equal(r.live?.account_id, "a");
  });

  it("prefers the active account, else the newest", () => {
    const accounts = [row("a", 600), row("b", 60)];
    assert.equal(pickLiveAccountContext({ accounts, activeAccountId: "a", now: NOW }).live?.account_id, "a");
    assert.equal(pickLiveAccountContext({ accounts, now: NOW }).live?.account_id, "b");
  });

  it("no usable state and no snapshot gives nothing", () => {
    const r = pickLiveAccountContext({ accounts: [{ id: "x", metadata: {} }], now: NOW });
    assert.deepEqual(r, { live: null, lastKnown: null });
  });

  it("prompt: fresh is headed LIVE with its age", () => {
    const { live } = pickLiveAccountContext({ accounts: [row("a", 120)], now: NOW });
    const block = liveAccountPromptBlock({ live_account: live })!;
    assert.match(block, /LIVE ACCOUNT/);
    assert.match(block, /2 min ago/);
    assert.doesNotMatch(block, /STALE/);
  });

  it("prompt: stale is never headed LIVE and says it is out of date", () => {
    const { live, lastKnown } = pickLiveAccountContext({ accounts: [row("a", 4 * 86400)], now: NOW });
    const block = liveAccountPromptBlock({ live_account: live, last_known_account: lastKnown })!;
    assert.doesNotMatch(block, /LIVE ACCOUNT/);
    assert.match(block, /LAST KNOWN ACCOUNT/);
    assert.match(block, /STALE/);
    assert.match(block, /4 days ago/);
    assert.match(block, /OUT OF DATE/);
  });

  it("prompt: no account, no block", () => {
    assert.equal(liveAccountPromptBlock({ live_account: null, last_known_account: null }), null);
  });

  it("age wording", () => {
    assert.equal(formatAccountAge(30), "just now");
    assert.equal(formatAccountAge(600), "10 min ago");
    assert.equal(formatAccountAge(3 * 3600), "3 h ago");
    assert.equal(formatAccountAge(null), "at an unknown time");
  });
});
