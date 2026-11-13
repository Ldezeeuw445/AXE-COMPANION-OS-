import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveFeed, type CachedFeed, type FeedRound } from "./feedCache.ts";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const NOW = Date.parse("2026-11-10T15:00:00Z");

function run(round: FeedRound<string[]>, cached?: CachedFeed<string[]>, now = NOW) {
  return resolveFeed({
    id: "darkPoolPrints",
    label: "Dark pool",
    description: "FINRA short volume",
    round,
    empty: [] as string[],
    hasRows: (r) => r.length > 0,
    cached,
    now,
    maxAgeMs: DAY,
  });
}

describe("INTEL-FREE per-feed fallback", () => {
  it("live rows are live and become the new cache", () => {
    const r = run({ ok: true, rows: ["AAPL"] }, { rows: ["OLD"], savedAt: NOW - 60 * MIN });
    assert.equal(r.status.state, "live");
    assert.deepEqual(r.rows, ["AAPL"]);
    assert.deepEqual(r.cache, { rows: ["AAPL"], savedAt: NOW });
    assert.equal(r.live, true);
    assert.equal(r.fromCache, false);
  });

  it("a failing feed keeps its last good rows as cached, with this round's reason", () => {
    const savedAt = NOW - 30 * MIN;
    const r = run({ ok: false, error: "short_volume_unavailable" }, { rows: ["MSFT"], savedAt });
    assert.equal(r.status.state, "stale");
    assert.deepEqual(r.rows, ["MSFT"]);
    assert.match(r.status.reason ?? "", /short_volume_unavailable/);
    assert.match(r.status.reason ?? "", /30 min old/);
    // The clock is not restarted: the next round still sees the original age.
    assert.deepEqual(r.cache, { rows: ["MSFT"], savedAt });
    assert.equal(r.fromCache, true);
    assert.equal(r.live, false);
  });

  it("a failing feed without cache shows unavailable with a clean reason", () => {
    const r = run({ ok: false, error: "intel_proxy_502:<html>bad gateway</html>" });
    assert.equal(r.status.state, "error");
    assert.deepEqual(r.rows, []);
    assert.equal(r.status.reason, "Bron tijdelijk niet bereikbaar (HTTP 502)");
    assert.doesNotMatch(r.status.description ?? "", /<html>/);
    assert.equal(r.cache, undefined);
  });

  it("cache older than the limit is dropped, not shown", () => {
    const r = run({ ok: false, error: "fmp_api_key_missing" }, { rows: ["OLD"], savedAt: NOW - DAY - MIN });
    assert.equal(r.status.state, "error");
    assert.deepEqual(r.rows, []);
    assert.equal(r.cache, undefined);
  });

  it("proxy-side stale rows show as cached and do not refresh our cache clock", () => {
    const prior = { rows: ["PRIOR"], savedAt: NOW - 2 * 60 * MIN };
    const r = run({ ok: true, rows: ["DBROW"], staleReason: "sec_edgar_empty; fmp_insider_empty" }, prior);
    assert.equal(r.status.state, "stale");
    assert.deepEqual(r.rows, ["DBROW"]);
    assert.deepEqual(r.cache, prior);
    assert.equal(r.live, false);
  });

  it("an empty live answer is off, and keeps an older cache for the next failure", () => {
    const prior = { rows: ["PRIOR"], savedAt: NOW - 5 * MIN };
    const r = run({ ok: true, rows: [] }, prior);
    assert.equal(r.status.state, "off");
    assert.deepEqual(r.rows, []);
    assert.deepEqual(r.cache, prior);
  });

  it("one feed failing does not change another feed's state", () => {
    const insider = run({ ok: true, rows: ["NVDA"] });
    const shortVol = run({ ok: false, error: "finra_file_missing" });
    assert.equal(insider.status.state, "live");
    assert.equal(shortVol.status.state, "error");
    assert.match(shortVol.status.description ?? "", /unavailable: finra_file_missing/);
  });
});
