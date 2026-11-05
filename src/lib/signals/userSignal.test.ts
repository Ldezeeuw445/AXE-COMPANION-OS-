import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseUserSignalInput } from "./userSignal";

describe("parseUserSignalInput", () => {
  it("accepts a manual long with levels", () => {
    const parsed = parseUserSignalInput({
      source: "manual",
      symbol: "eurusd",
      side: "long",
      entry: 1.085,
      sl: 1.08,
      tp: 1.09,
      raw_text: "desk note",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.row.source, "manual");
    assert.equal(parsed.row.symbol, "EURUSD");
    assert.equal(parsed.row.side, "long");
    assert.equal(parsed.row.status, "new");
    assert.equal(parsed.row.entry, 1.085);
  });

  it("rejects unknown source", () => {
    const parsed = parseUserSignalInput({ source: "discord", symbol: "XAUUSD" });
    assert.equal(parsed.ok, false);
  });

  it("defaults status to new", () => {
    const parsed = parseUserSignalInput({ source: "telegram", symbol: "BTCUSD" });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.row.status, "new");
    assert.equal(parsed.row.side, null);
  });
});
