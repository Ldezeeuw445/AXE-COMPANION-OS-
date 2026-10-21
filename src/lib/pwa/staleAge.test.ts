import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACCOUNT_STALE_MS,
  CANDLE_FRESH_MS,
  QUOTE_STALE_MS,
  accountFreshness,
  ageMs,
  candleFreshness,
  formatCompactAge,
  isOlderThan,
  quoteFreshness,
} from "./staleAge";

const NOW = Date.parse("2026-10-21T12:00:00.000Z");

describe("staleAge helpers", () => {
  it("formats compact ages", () => {
    assert.equal(formatCompactAge(8_000), "8s");
    assert.equal(formatCompactAge(3 * 60_000), "3m");
    assert.equal(formatCompactAge(2 * 3_600_000), "2h");
    assert.equal(formatCompactAge(3 * 86_400_000), "3d");
  });

  it("treats missing timestamps as older than any threshold", () => {
    assert.equal(isOlderThan(null, QUOTE_STALE_MS, NOW), true);
    assert.equal(ageMs("not-a-date", NOW), null);
  });
});

describe("quoteFreshness", () => {
  it("looks live only when online and inside the threshold", () => {
    const asOf = new Date(NOW - 12_000).toISOString();
    const live = quoteFreshness({ asOf, online: true, now: NOW });
    assert.equal(live.kind, "live");
    assert.equal(live.stale, false);
    assert.equal(live.badge, null);
  });

  it("shows an age badge past the threshold", () => {
    const asOf = new Date(NOW - 3 * 60_000).toISOString();
    const stale = quoteFreshness({ asOf, online: true, now: NOW });
    assert.equal(stale.kind, "stale");
    assert.equal(stale.badge, "3m ago");
    assert.ok(stale.ageMs != null && stale.ageMs > QUOTE_STALE_MS);
  });

  it("marks cached or offline quotes stale even when the tick is recent", () => {
    const asOf = new Date(NOW - 5_000).toISOString();
    const offline = quoteFreshness({ asOf, online: false, now: NOW });
    assert.equal(offline.kind, "offline");
    assert.equal(offline.badge, "Offline · 5s");
    const cached = quoteFreshness({ asOf, online: true, fromCache: true, now: NOW });
    assert.equal(cached.kind, "offline");
    assert.match(cached.badge ?? "", /Offline/);
  });
});

describe("accountFreshness", () => {
  it("always surfaces last sync time, and flags stale past the threshold", () => {
    const fresh = accountFreshness({
      lastSyncAt: new Date(NOW - 90_000).toISOString(),
      online: true,
      now: NOW,
    });
    assert.equal(fresh.kind, "live");
    assert.equal(fresh.badge, "Synced 2m ago");

    const stale = accountFreshness({
      lastSyncAt: new Date(NOW - ACCOUNT_STALE_MS - 60_000).toISOString(),
      online: true,
      now: NOW,
    });
    assert.equal(stale.kind, "stale");
    assert.match(stale.badge ?? "", /^Stale · /);
  });

  it("says never synced when lastSyncAt is missing", () => {
    const missing = accountFreshness({ lastSyncAt: null, online: true, now: NOW });
    assert.equal(missing.badge, "Never synced");
    assert.equal(missing.stale, true);
  });
});

describe("candleFreshness", () => {
  it("keeps a last-snapshot age even after the fresh window", () => {
    const savedAt = NOW - CANDLE_FRESH_MS - 60_000;
    const stale = candleFreshness({ savedAt, online: true, now: NOW });
    assert.equal(stale.kind, "stale");
    assert.equal(stale.stale, true);
    const offline = candleFreshness({ savedAt, online: false, now: NOW });
    assert.equal(offline.kind, "offline");
  });
});
