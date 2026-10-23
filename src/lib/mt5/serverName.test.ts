import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ambiguousServerMessage, chooseServer } from "./serverName";

// What MetaApi's known-mt-servers search answered for "Upcomers" on 2026-10-20.
const UPCOMERS = {
  "Upcomers Ltd.": ["Upcomers-Server"],
  "Supreme FX LLC": ["Supreme-Server"],
  "AUS Commercial Limited": ["AUSCommercial-Demo", "AUSCommercial-Live"],
};

describe("chooseServer", () => {
  it("resolves the dashboard name to the real MT5 server", () => {
    assert.deepEqual(chooseServer("Upcomers", UPCOMERS), {
      kind: "resolved",
      server: "Upcomers-Server",
      broker: "Upcomers Ltd.",
    });
  });

  it("keeps an exact name as typed", () => {
    assert.deepEqual(chooseServer("Upcomers-Server", UPCOMERS), { kind: "exact", server: "Upcomers-Server" });
  });

  it("fixes case and punctuation", () => {
    assert.equal(chooseServer(" upcomers server ", UPCOMERS).kind, "resolved");
  });

  it("never guesses between demo and live", () => {
    const uit = chooseServer("AUSCommercial", UPCOMERS);
    assert.equal(uit.kind, "ambiguous");
    if (uit.kind === "ambiguous") {
      assert.deepEqual(uit.options.map((o) => o.server), ["AUSCommercial-Demo", "AUSCommercial-Live"]);
      assert.match(ambiguousServerMessage("AUSCommercial", uit.options), /AUSCommercial-Demo \(AUS Commercial Limited\)/);
    }
  });

  it("lets an unknown name through so MetaApi gives its own verdict", () => {
    assert.deepEqual(chooseServer("BrandNewFirm-Live", UPCOMERS), { kind: "unknown" });
    assert.deepEqual(chooseServer("Upcomers", {}), { kind: "unknown" });
    assert.deepEqual(chooseServer("Upcomers", { broken: "not-a-list" }), { kind: "unknown" });
  });
});
