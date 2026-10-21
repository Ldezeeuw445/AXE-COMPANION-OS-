import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BROKER_SUPPORT_TITLES,
  isExactKnownIdentity,
  lookupBrokerSupport,
  normalizeBrokerQuery,
  pickBrokerServer,
  suggestKnownBrokers,
} from "./knownBrokers";

describe("lookupBrokerSupport", () => {
  it("returns nothing until the trader types a name", () => {
    assert.equal(lookupBrokerSupport(""), null);
    assert.equal(lookupBrokerSupport("   "), null);
  });

  it("recognises a known server string as supported", () => {
    const r = lookupBrokerSupport("ICMarketsSC-Live02");
    assert.ok(r);
    assert.equal(r.kind, "known");
    assert.equal(r.title, "Known broker — supported");
    assert.equal(r.title, BROKER_SUPPORT_TITLES.known);
    assert.equal(r.match?.name, "IC Markets");
    assert.match(r.explanation, /nothing is sent until you press Connect/i);
  });

  it("recognises a broker name the trader typed, not only a server", () => {
    const r = lookupBrokerSupport("ic markets");
    assert.equal(r?.kind, "known");
    assert.equal(r?.match?.name, "IC Markets");
  });

  it("recognises firms this repo has actually connected", () => {
    assert.equal(lookupBrokerSupport("FTMO-Server")?.kind, "known");
    assert.equal(lookupBrokerSupport("Upcomers")?.kind, "known");
    assert.equal(lookupBrokerSupport("XM")?.kind, "known");
  });

  it("calls an unlisted MT5 name unknown, not a refusal", () => {
    const r = lookupBrokerSupport("WhiteLabelProp-Live");
    assert.ok(r);
    assert.equal(r.kind, "unknown");
    assert.equal(r.title, "Unknown — may still work");
    assert.equal(r.match, null);
    assert.match(r.explanation, /may still connect|still connect/i);
  });

  it("refuses platforms that are not MT5", () => {
    for (const name of ["cTrader", "Interactive Brokers", "Alpaca", "Topstep", "NinjaTrader"]) {
      const r = lookupBrokerSupport(name);
      assert.equal(r?.kind, "unsupported", name);
      assert.equal(r?.title, "Not supported");
    }
  });

  it("refuses MT4 even when the broker itself is known on MT5", () => {
    const r = lookupBrokerSupport("ICMarkets-MT4");
    assert.equal(r?.kind, "unsupported");
    assert.equal(r?.match?.name, "MetaTrader 4");
  });

  it("does not take a login or password argument", () => {
    assert.equal(lookupBrokerSupport.length, 1);
  });

  it("never puts credentials on the result", () => {
    const r = lookupBrokerSupport("ICMarketsSC-Live02");
    assert.ok(r);
    assert.equal("password" in r, false);
    assert.equal("login" in r, false);
    assert.deepEqual(Object.keys(r).sort(), ["explanation", "kind", "match", "title"]);
  });
});

describe("suggestKnownBrokers / pickBrokerServer", () => {
  it("offers popular brokers when the field is empty", () => {
    const popular = suggestKnownBrokers("");
    assert.ok(popular.length >= 4);
    assert.equal(popular[0]?.id, "icmarkets");
    assert.ok(popular.some((b) => b.id === "ftmo"));
  });

  it("filters as the trader types", () => {
    const pep = suggestKnownBrokers("pep");
    assert.ok(pep.some((b) => b.id === "pepperstone"));
    assert.ok(pep.every((b) => /pep/i.test(`${b.name}${b.sampleServer}`)));
  });

  it("fills a real server string when a chip is picked", () => {
    assert.equal(pickBrokerServer("icmarkets"), "ICMarketsSC-Live");
    assert.equal(pickBrokerServer("nope"), null);
  });
});

describe("isExactKnownIdentity", () => {
  it("treats a listed server as already picked so the suggestion list can hide", () => {
    assert.equal(isExactKnownIdentity("ICMarketsSC-Live02"), true);
    assert.equal(isExactKnownIdentity("pepper"), false);
  });
});

describe("normalizeBrokerQuery", () => {
  it("ignores case, spaces and punctuation so Live02 still matches", () => {
    assert.equal(normalizeBrokerQuery("  IC Markets SC-Live02 "), "icmarketssclive02");
  });
});
