import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseExtractedMemories,
  parseMemoryLimit,
  selectMemoriesToStore,
  trimConversation,
} from "./memoryRules";

describe("parseMemoryLimit", () => {
  it("falls back to 20 for missing, NaN, zero or negative", () => {
    assert.equal(parseMemoryLimit(null), 20);
    assert.equal(parseMemoryLimit("abc"), 20);
    assert.equal(parseMemoryLimit("0"), 20);
    assert.equal(parseMemoryLimit("-5"), 20);
  });
  it("caps at 100", () => {
    assert.equal(parseMemoryLimit("500"), 100);
    assert.equal(parseMemoryLimit("7"), 7);
  });
});

describe("trimConversation", () => {
  it("drops malformed rows, keeps last 20, caps length", () => {
    const msgs = [
      { role: "user", content: 5 },
      null,
      ...Array.from({ length: 25 }, (_, i) => ({ role: "user", content: `m${i}` })),
      { role: "assistant", content: "x".repeat(5000) },
    ];
    const out = trimConversation(msgs);
    assert.equal(out.length, 20);
    assert.equal(out[out.length - 1].content.length, 2000);
    assert.deepEqual(trimConversation("nope"), []);
  });
});

describe("parseExtractedMemories", () => {
  it("handles fences, bad types, empty content and bad confidence", () => {
    const raw =
      "```json\n" +
      JSON.stringify({
        memories: [
          { memory_type: "pattern", content: " Closes winners early ", symbol: "xauusd", confidence: 0.9 },
          { memory_type: "bogus", content: "Trades London", symbol: "", confidence: "x" },
          { memory_type: "rule", content: "   ", confidence: 1 },
          "junk",
        ],
      }) +
      "\n```";
    const out = parseExtractedMemories(raw);
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], {
      memory_type: "pattern",
      content: "Closes winners early",
      symbol: "XAUUSD",
      confidence: 0.9,
    });
    assert.equal(out[1].memory_type, "observation");
    assert.equal(out[1].symbol, null);
    assert.equal(out[1].confidence, 0.5);
  });
  it("returns [] on invalid JSON or missing list", () => {
    assert.deepEqual(parseExtractedMemories("not json"), []);
    assert.deepEqual(parseExtractedMemories('{"memories":"x"}'), []);
    assert.deepEqual(parseExtractedMemories(null), []);
  });
});

describe("selectMemoriesToStore", () => {
  const m = (content: string, confidence = 0.8, memory_type = "preference" as const) => ({
    memory_type,
    content,
    symbol: null,
    confidence,
  });
  it("skips low confidence, existing duplicates and in-batch duplicates", () => {
    const out = selectMemoriesToStore(
      [m("Prefers gold."), m("prefers GOLD"), m("Low", 0.4), m("Trades NY open"), m("Likes risk 1%")],
      [{ memory_type: "preference", content: "Likes risk 1%!" }],
    );
    assert.deepEqual(out.map((x) => x.content), ["Prefers gold.", "Trades NY open"]);
  });
  it("same text with another type is not a duplicate; caps at 5", () => {
    const out = selectMemoriesToStore(
      [m("A"), { ...m("A"), memory_type: "rule" }, m("B"), m("C"), m("D"), m("E"), m("F")],
      [],
    );
    assert.equal(out.length, 5);
  });
});
