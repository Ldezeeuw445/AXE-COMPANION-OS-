import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GENERAL_CHAT_SYMBOL,
  SYMBOL_TOUCH_FRESH_MS,
  detectSymbolsInText,
  isPillFresh,
  loggingSymbolForResolution,
  resolveChatSymbolContext,
} from "./resolveChatSymbolContext";

describe("detectSymbolsInText", () => {
  it("maps aliases like gold → XAUUSD", () => {
    assert.deepEqual(detectSymbolsInText("looking at gold tonight"), ["XAUUSD"]);
  });

  it("picks the first mentioned symbol in order", () => {
    const found = detectSymbolsInText("AAPL vs eurusd — which first?");
    assert.equal(found[0], "AAPL");
    assert.ok(found.includes("EURUSD"));
  });

  it("returns empty when nothing matches", () => {
    assert.deepEqual(detectSymbolsInText("how was my session?"), []);
  });
});

describe("isPillFresh", () => {
  it("is fresh within the window and stale after", () => {
    const now = Date.parse("2026-11-04T08:00:00.000Z");
    assert.equal(isPillFresh(new Date(now - 5 * 60_000).toISOString(), now), true);
    assert.equal(
      isPillFresh(new Date(now - SYMBOL_TOUCH_FRESH_MS - 1).toISOString(), now),
      false
    );
    assert.equal(isPillFresh(null, now), false);
    assert.equal(isPillFresh("not-a-date", now), false);
  });
});

describe("resolveChatSymbolContext", () => {
  const now = Date.parse("2026-11-04T08:00:00.000Z");
  const freshTouch = new Date(now - 2 * 60_000).toISOString();
  const staleTouch = new Date(now - SYMBOL_TOUCH_FRESH_MS - 60_000).toISOString();

  it("lets a mentioned symbol win and requests pill auto-switch", () => {
    const r = resolveChatSymbolContext({
      messageText: "levels on gold please",
      pillSymbol: "AAPL",
      symbolTouchedAt: freshTouch,
      nowMs: now,
    });
    assert.equal(r.mentionedSymbol, "XAUUSD");
    assert.equal(r.effectiveSymbol, "XAUUSD");
    assert.equal(r.shouldAutoSwitchPill, true);
    assert.equal(r.chartContextStale, false);
    assert.equal(r.promptHint, null);
    assert.equal(loggingSymbolForResolution(r), "XAUUSD");
  });

  it("uses a fresh pill when the message names no symbol", () => {
    const r = resolveChatSymbolContext({
      messageText: "what's the bias?",
      pillSymbol: "EURUSD",
      symbolTouchedAt: freshTouch,
      nowMs: now,
    });
    assert.equal(r.effectiveSymbol, "EURUSD");
    assert.equal(r.shouldAutoSwitchPill, false);
    assert.equal(r.chartContextStale, false);
  });

  it("treats a stale pill as unknown and supplies a prompt hint", () => {
    const r = resolveChatSymbolContext({
      messageText: "what's the bias?",
      pillSymbol: "AAPL",
      symbolTouchedAt: staleTouch,
      nowMs: now,
    });
    assert.equal(r.effectiveSymbol, null);
    assert.equal(r.pillFresh, false);
    assert.equal(r.chartContextStale, true);
    assert.ok(r.promptHint && r.promptHint.includes("STALE"));
    assert.equal(loggingSymbolForResolution(r), GENERAL_CHAT_SYMBOL);
  });

  it("treats a never-touched pill as stale", () => {
    const r = resolveChatSymbolContext({
      messageText: "session review",
      pillSymbol: "NAS100",
      symbolTouchedAt: null,
      nowMs: now,
    });
    assert.equal(r.effectiveSymbol, null);
    assert.equal(r.chartContextStale, true);
  });
});
