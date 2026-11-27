import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateOverride } from "./learningModelService";

describe("validateOverride", () => {
  it("accepts a session correction", () => {
    assert.deepEqual(validateOverride({ itemKey: "timing", action: "correct", value: "newyork" }), {
      ok: true,
      itemKey: "timing",
      action: "correct",
      value: "newyork",
    });
  });
  it("rejects an unknown session", () => {
    assert.equal(validateOverride({ itemKey: "timing", action: "correct", value: "tokyo" }).ok, false);
  });
  it("accepts a focus list and rejects junk", () => {
    assert.equal(validateOverride({ itemKey: "focus", action: "correct", value: "XAUUSD, BTCUSD" }).ok, true);
    assert.equal(validateOverride({ itemKey: "focus", action: "correct", value: "<script>" }).ok, false);
  });
  it("only families can be reset; items can be hidden", () => {
    assert.equal(validateOverride({ itemKey: "all", action: "reset" }).ok, true);
    assert.equal(validateOverride({ itemKey: "instrument:XAUUSD", action: "reset" }).ok, false);
    assert.equal(validateOverride({ itemKey: "instrument:XAUUSD", action: "hide" }).ok, true);
    assert.equal(validateOverride({ itemKey: "session:london:edge", action: "hide" }).ok, true);
  });
  it("rejects bad keys and actions", () => {
    assert.equal(validateOverride({ itemKey: "x; drop", action: "hide" }).ok, false);
    assert.equal(validateOverride({ itemKey: "timing", action: "delete" }).ok, false);
    assert.equal(validateOverride(null).ok, false);
  });
});
