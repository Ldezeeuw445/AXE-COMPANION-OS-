import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  INTEL_ACTIONS_NOT_PROBED,
  intelFeedProbes,
  knownIntelActions,
  readProbeReply,
} from "./intelFeedProbes.ts";

const OFF = {};
const UW_ON = { UNUSUAL_WHALES_ENABLED: "true" };

describe("INTEL-FREE key-health probes", () => {
  it("probes every intel action the app calls, or says why not", () => {
    const probed = new Set(intelFeedProbes(OFF).map((p) => p.action));
    for (const action of knownIntelActions()) {
      assert.ok(
        probed.has(action) || action in INTEL_ACTIONS_NOT_PROBED,
        `${action} is neither probed nor listed as skipped`,
      );
    }
    for (const action of probed) {
      assert.ok(knownIntelActions().includes(action), `${action} is probed but the app never calls it`);
    }
  });

  it("names the free sources and needs no Unusual Whales key by default", () => {
    const byAction = Object.fromEntries(intelFeedProbes(OFF).map((p) => [p.action, p]));
    assert.match(byAction.insiderTrades.source, /FMP/);
    assert.match(byAction.insiderTrades.source, /SEC EDGAR Form 4/);
    assert.match(byAction.senateTrades.source, /FMP senate and house/);
    assert.match(byAction.darkPoolPrints.source, /FINRA daily short sale volume/);
    for (const p of intelFeedProbes(OFF)) {
      assert.ok(!p.env.some((e) => /UNUSUAL_WHALES/.test(e)), `${p.action} still asks for Unusual Whales`);
      assert.ok(!/Unusual Whales/.test(p.source), `${p.action} still names Unusual Whales`);
    }
  });

  it("adds Unusual Whales as optional only once it is switched on", () => {
    const byAction = Object.fromEntries(intelFeedProbes(UW_ON).map((p) => [p.action, p]));
    for (const action of ["insiderTrades", "darkPoolPrints", "unusualOptions", "marketTide"]) {
      assert.ok(byAction[action].env.includes("UNUSUAL_WHALES_TOKEN"));
      assert.match(byAction[action].source, /Unusual Whales \(optional\)$/);
    }
    assert.ok(!byAction.senateTrades.env.includes("UNUSUAL_WHALES_TOKEN"));
  });

  it("reads live rows as ok", () => {
    const r = readProbeReply({ action: "insiderTrades", source: "FMP" }, true, 200, {
      ok: true,
      data: [{}, {}],
      source: "fmp",
    });
    assert.deepEqual(r, { state: "ok", detail: "2 rows source=fmp" });
  });

  it("does not call cached rows healthy, and keeps the reason", () => {
    const r = readProbeReply({ action: "darkPoolPrints", source: "FINRA daily short sale volume" }, true, 200, {
      ok: true,
      data: [{}],
      source: "db_stale",
      unavailable: ["finra_http_503"],
    });
    assert.equal(r.state, "error");
    assert.match(r.detail, /cached rows only/);
    assert.match(r.detail, /finra_http_503/);
  });

  it("says redeploy when the proxy has no handler, not that a key is bad", () => {
    const r = readProbeReply({ action: "cyberThreats", source: "CISA" }, false, 401, { ok: false, error: "invalid_token" });
    assert.equal(r.state, "error");
    assert.match(r.detail, /no public handler for cyberThreats/);
    assert.match(r.detail, /redeploy/);
  });

  it("keeps the proxy's own error, or the HTTP status when there is none", () => {
    assert.deepEqual(
      readProbeReply({ action: "senateTrades", source: "FMP" }, true, 200, { ok: false, error: "fmp_api_key_missing" }),
      { state: "error", detail: "fmp_api_key_missing" },
    );
    assert.deepEqual(readProbeReply({ action: "senateTrades", source: "FMP" }, false, 502, null), {
      state: "error",
      detail: "HTTP 502",
    });
  });

  it("names the source when a feed answers with nothing", () => {
    const r = readProbeReply({ action: "senateTrades", source: "FMP senate and house trading" }, true, 200, {
      ok: true,
      data: [],
    });
    assert.equal(r.state, "error");
    assert.match(r.detail, /FMP senate and house trading returned nothing/);
  });

  it("the route uses this list instead of its own", () => {
    const route = readFileSync("src/app/api/internal/key-health/route.ts", "utf8");
    assert.match(route, /intelFeedProbes\(process\.env\)/);
    assert.match(route, /readProbeReply\(/);
    assert.ok(!/RETIRED_ACTIONS/.test(route), "four live feeds were reported as retired");
  });
});
