import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeLastQuotes, type CachedQuotesSnapshot } from "./lastQuotesCache";

describe("mergeLastQuotes", () => {
  it("fills empty bid/ask from the last snapshot and keeps live rows", () => {
    const snapshot: CachedQuotesSnapshot = {
      savedAt: 1_700_000_000_000,
      rows: [
        { symbol: "XAUUSD", bid: 2640.1, ask: 2640.4, freshness: "2026-10-21T11:00:00.000Z" },
        { symbol: "EURUSD", bid: 1.08, ask: 1.0802, freshness: "2026-10-21T11:00:00.000Z" },
      ],
    };
    const merged = mergeLastQuotes(
      [
        { symbol: "XAUUSD", bid: null, ask: null },
        { symbol: "EURUSD", bid: 1.081, ask: 1.0812, freshness: "2026-10-21T12:00:00.000Z" },
      ],
      snapshot,
    );
    assert.equal(merged[0]?.bid, 2640.1);
    assert.equal(merged[0]?.freshness, "2026-10-21T11:00:00.000Z");
    assert.equal(merged[1]?.bid, 1.081);
    assert.equal(merged[1]?.freshness, "2026-10-21T12:00:00.000Z");
  });
});
