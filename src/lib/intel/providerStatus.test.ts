import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { providerTile, staleReasonFromProxy } from "./providerStatus.ts";

describe("INTEL-FREE stale source reasons", () => {
  it("treats fresh replies as live", () => {
    assert.equal(staleReasonFromProxy({ source: "sec_edgar" }), undefined);
    assert.equal(staleReasonFromProxy({ source: "fmp", unavailable: ["sec_edgar_empty"] }), undefined);
    assert.equal(staleReasonFromProxy({}), undefined);
  });

  it("keeps the source reasons when the proxy falls back to cached rows", () => {
    assert.equal(
      staleReasonFromProxy({
        source: "db_stale",
        unavailable: ["sec_edgar_empty", "fmp_api_key_missing"],
      }),
      "sec_edgar_empty; fmp_api_key_missing",
    );
  });

  it("caps and cleans the reason list", () => {
    assert.equal(
      staleReasonFromProxy({ source: "db_stale", unavailable: ["a", "", 7, "b", "c", "d"] }),
      "a; b; c",
    );
    assert.equal(staleReasonFromProxy({ source: "db_stale" }), "live_sources_unavailable");
  });
});

describe("INTEL-FREE provider tiles", () => {
  it("marks cached rows as stale with the reason, not live", () => {
    const tile = providerTile("insiderTrades", "Insider trades", "Feed", true, undefined, "fmp_insider_empty");
    assert.equal(tile.state, "stale");
    assert.equal(tile.reason, "fmp_insider_empty");
    assert.match(tile.description ?? "", /cached rows.*fmp_insider_empty/);
  });

  it("keeps live, error and off as before", () => {
    assert.equal(providerTile("x", "X", "Feed", true).state, "live");
    const err = providerTile("x", "X", "Feed", false, "short_volume_unavailable");
    assert.equal(err.state, "error");
    assert.equal(err.reason, "short_volume_unavailable");
    const off = providerTile("x", "X", "Feed", false);
    assert.equal(off.state, "off");
    assert.equal(off.reason, "no_data");
  });

  it("an empty stale read is not shown as stale", () => {
    // ok=false (no rows) wins over a stale reason: nothing cached is on screen.
    assert.equal(providerTile("x", "X", "Feed", false, undefined, "fmp_insider_empty").state, "off");
  });
});
