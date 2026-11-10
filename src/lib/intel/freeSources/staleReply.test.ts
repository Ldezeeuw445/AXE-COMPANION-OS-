/**
 * INTEL-FREE: a stale fallback stays stale while it sits in the proxy cache.
 *
 * Imported straight from the edge function (pure TypeScript, no imports), like
 * the insider and FINRA rules.
 *
 * Whole suite: npm test
 * This file only: node --import ./scripts/bundler-resolve.mjs --test src/lib/intel/freeSources/staleReply.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  STALE_REPLY_TTL_MS,
  cacheTtlFor,
  isStaleReply,
  replyBody,
  staleReply,
} from "../../../../supabase/functions/intel-proxy/freeSources/staleReply.ts";
import { providerTile, staleReasonFromProxy } from "../providerStatus.ts";

const LIVE_TTL = 15 * 60 * 1000;
const rows = [{ ticker: "AAPL" }];

describe("INTEL-FREE stale replies in the proxy cache", () => {
  it("a cached stale fallback answers with db_stale and its reasons", () => {
    const cached = staleReply(rows, ["sec_edgar_empty", "fmp_api_key_missing"]);
    const body = replyBody(cached);
    assert.deepEqual(body, {
      ok: true,
      data: rows,
      source: "db_stale",
      unavailable: ["sec_edgar_empty", "fmp_api_key_missing"],
    });
    // The app reads it as stale, not live: the bug was a bare array here.
    assert.equal(staleReasonFromProxy(body), "sec_edgar_empty; fmp_api_key_missing");
  });

  it("a cached stale fallback renders as a stale tile on every hit", () => {
    const cached = staleReply(rows, ["finra_cnms_404"]);
    for (let i = 0; i < 3; i++) {
      const body = replyBody(cached, "cache");
      const tile = providerTile(
        "shortVolume",
        "Short volume",
        "FINRA daily",
        body.ok,
        undefined,
        staleReasonFromProxy(body),
      );
      assert.equal(tile.state, "stale");
      assert.equal(tile.reason, "finra_cnms_404");
    }
  });

  it("a live cache hit stays live", () => {
    assert.equal(staleReasonFromProxy(replyBody(rows, "cache")), undefined);
    assert.equal(staleReasonFromProxy(replyBody(rows)), undefined);
  });

  it("live rows keep their old cache-hit shape", () => {
    assert.deepEqual(replyBody(rows), { ok: true, data: rows });
    assert.deepEqual(replyBody(rows, "cache"), { ok: true, data: rows, source: "cache" });
    assert.equal(isStaleReply(rows), false);
  });

  it("stale entries expire sooner so live sources get retried", () => {
    assert.equal(cacheTtlFor(rows, LIVE_TTL), LIVE_TTL);
    assert.equal(cacheTtlFor(staleReply(rows, ["x"]), LIVE_TTL), STALE_REPLY_TTL_MS);
    assert.ok(STALE_REPLY_TTL_MS < LIVE_TTL);
    // Never longer than the live TTL, whatever that is set to.
    assert.equal(cacheTtlFor(staleReply(rows, ["x"]), 60_000), 60_000);
  });

  it("copies the reasons so later pushes don't leak into the cached entry", () => {
    const reasons = ["a"];
    const cached = staleReply(rows, reasons);
    reasons.push("b");
    assert.deepEqual(cached.unavailable, ["a"]);
  });

  it("ships the stale-reply contract the shared proxy must use", () => {
    // After #149 the deployed intel-proxy lives in trading-os-app. Companion
    // keeps this pure module so both sides share one cache-shape contract.
    const mod = readFileSync(
      new URL("../../../../supabase/functions/intel-proxy/freeSources/staleReply.ts", import.meta.url),
      "utf8",
    );
    assert.match(mod, /export function staleReply/);
    assert.match(mod, /export function replyBody/);
    assert.match(mod, /export function cacheTtlFor/);
    assert.match(mod, /source:\s*"db_stale"/);
  });
});
