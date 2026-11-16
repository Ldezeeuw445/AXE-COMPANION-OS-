import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AUTO_DEPLOY_MIN_INTERVAL_MS, decideDeployAction } from "./accountDeployment";
import { syncDueReason } from "./syncDue";
import { liveAccountDayKey, nextLiveAccountState } from "./liveAccountSnapshot";

const NOW = new Date("2026-11-16T18:00:00Z");

describe("undeployed MetaApi account (2026-11-12 outage)", () => {
  it("restarts an undeployed account when allowed", () => {
    assert.equal(decideDeployAction({ state: "UNDEPLOYED", allowDeploy: true, now: NOW }), "deploy");
    assert.equal(decideDeployAction({ state: "created", allowDeploy: true, now: NOW }), "deploy");
  });
  it("does not restart when the caller did not allow it", () => {
    assert.equal(decideDeployAction({ state: "UNDEPLOYED", allowDeploy: false, now: NOW }), "not_allowed");
  });
  it("restarts at most once per interval per account", () => {
    const recent = new Date(NOW.getTime() - AUTO_DEPLOY_MIN_INTERVAL_MS + 60_000).toISOString();
    const old = new Date(NOW.getTime() - AUTO_DEPLOY_MIN_INTERVAL_MS - 60_000).toISOString();
    assert.equal(decideDeployAction({ state: "UNDEPLOYED", allowDeploy: true, lastAutoDeployAt: recent, now: NOW }), "rate_limited");
    assert.equal(decideDeployAction({ state: "UNDEPLOYED", allowDeploy: true, lastAutoDeployAt: old, now: NOW }), "deploy");
  });
  it("leaves a deploying account alone and proceeds on a running one", () => {
    assert.equal(decideDeployAction({ state: "DEPLOYING", allowDeploy: true, now: NOW }), "wait");
    assert.equal(decideDeployAction({ state: "DEPLOYED", allowDeploy: true, now: NOW }), "proceed");
    assert.equal(decideDeployAction({ state: undefined, allowDeploy: true, now: NOW }), "proceed");
  });
});

describe("which accounts the background sync picks", () => {
  const state = (dayStartDate: string) => ({ liveAccountState: { dayStartDate } });
  const today = liveAccountDayKey({}, NOW);
  it("never synced, or older than minAge", () => {
    assert.equal(syncDueReason({ lastSyncAt: null, now: NOW, minAgeMs: 480_000 }), "never");
    assert.equal(syncDueReason({ lastSyncAt: new Date(NOW.getTime() - 9 * 60_000).toISOString(), metadata: state(today), now: NOW, minAgeMs: 8 * 60_000 }), "age");
  });
  it("a sync 9 minutes ago is skipped by the old 10-minute rule but due at 8", () => {
    const lastSyncAt = new Date(NOW.getTime() - 9 * 60_000).toISOString();
    assert.equal(syncDueReason({ lastSyncAt, metadata: state(today), now: NOW, minAgeMs: 10 * 60_000 }), null);
    assert.equal(syncDueReason({ lastSyncAt, metadata: state(today), now: NOW, minAgeMs: 8 * 60_000 }), "age");
  });
  it("a recent sync is still due when the day anchors are from yesterday", () => {
    const lastSyncAt = new Date(NOW.getTime() - 2 * 60_000).toISOString();
    assert.equal(syncDueReason({ lastSyncAt, metadata: state("2026-11-15"), now: NOW, minAgeMs: 8 * 60_000 }), "day_roll");
    assert.equal(syncDueReason({ lastSyncAt, metadata: state(today), now: NOW, minAgeMs: 8 * 60_000 }), null);
  });
  it("a recent sync of an account with no live state yet is due", () => {
    const lastSyncAt = new Date(NOW.getTime() - 2 * 60_000).toISOString();
    assert.equal(syncDueReason({ lastSyncAt, metadata: {}, now: NOW, minAgeMs: 8 * 60_000 }), "day_roll");
  });
});

describe("the day anchor is stamped when the broker day opens", () => {
  it("first sync after the open records dayStartAt; later syncs keep it", () => {
    const open = new Date("2026-11-16T22:03:00Z"); // 00:03 EET on the 17th
    const first = nextLiveAccountState({}, { balance: 1000, equity: 1000, margin: null, freeMargin: null, marginLevel: null, currency: "USD", profit: null }, open);
    const stateFirst = first.liveAccountState as Record<string, unknown>;
    assert.equal(stateFirst.dayStartAt, open.toISOString());
    const later = nextLiveAccountState(first, { balance: 900, equity: 900, margin: null, freeMargin: null, marginLevel: null, currency: "USD", profit: null }, new Date("2026-11-17T08:00:00Z"));
    assert.equal((later.liveAccountState as Record<string, unknown>).dayStartAt, open.toISOString());
    assert.equal((later.liveAccountState as Record<string, unknown>).dayStartEquity, 1000);
  });
});
