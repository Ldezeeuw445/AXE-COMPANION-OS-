import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildChatPriceFactsPrompt,
  chatPriceStreamNote,
  createChatPriceFactsCache,
  detectChatPriceSymbols,
  findChatPriceViolations,
  guardChatReply,
  symbolsForChatValidation,
} from "./chatPriceGuard";
import { computeSymbolFacts, type SymbolFactsResult } from "./priceFacts";

const NOW = new Date("2026-11-17T12:50:00Z"); // Tuesday, markets open

function facts(symbol: string, price: number): SymbolFactsResult {
  const f = computeSymbolFacts({
    symbol,
    source: "twelve_data",
    sourceLabel: "Twelve Data spot",
    dailyCandles: [{ time: "2026-11-17T00:00:00Z", open: price, high: price * 1.005, low: price * 0.995, close: price }],
    lastPrice: price,
    asOf: NOW.toISOString(),
    now: NOW,
  });
  assert.ok(f);
  return { ok: true, facts: f };
}

const GOLD = facts("XAUUSD", 3860.07);
const BTC = facts("BTCUSD", 65001.73);
const STALE_GOLD = "Gold looks heavy. If XAUUSD breaks above resistance near 1950 it could squeeze higher.";
const GOOD_GOLD = "Gold looks heavy. If XAUUSD breaks above today's high near 3,880 it could squeeze higher.";

describe("chat price guard — market detection", () => {
  it("detects gold / BTC in the message and nothing in small talk", () => {
    assert.deepEqual(detectChatPriceSymbols({ message: "what do you think of gold this week?" }), ["XAUUSD"]);
    assert.ok(detectChatPriceSymbols({ message: "is BTCUSD still bullish?" }).includes("BTCUSD"));
    assert.deepEqual(detectChatPriceSymbols({ message: "hey, how was your day?" }), []);
  });

  it("uses the effective chart symbol and the last user turns, capped at 3", () => {
    assert.deepEqual(detectChatPriceSymbols({ message: "where are the levels?", effectiveSymbol: "xau/usd" }), ["XAUUSD"]);
    assert.deepEqual(
      detectChatPriceSymbols({ message: "and the levels?", recentUserMessages: ["old", "tell me about gold"] }),
      ["XAUUSD"],
    );
    const many = detectChatPriceSymbols({ message: "gold, BTCUSD, EURUSD and GBPUSD" });
    assert.equal(many.length, 3);
  });

  it("validates markets the answer names even when the trader did not", () => {
    assert.deepEqual(symbolsForChatValidation(["XAUUSD"], "Bitcoin near 30,000 too."), ["XAUUSD", "BTCUSD"]);
  });
});

describe("chat price guard — prompt", () => {
  it("injects nothing without a market (keeps chat cheap)", () => {
    assert.equal(buildChatPriceFactsPrompt([]), "");
  });

  it("injects the PRICE FACTS block with live prices and hard rules", () => {
    const p = buildChatPriceFactsPrompt([GOLD, { ok: false, symbol: "NAS100", reason: "no fresh price" }]);
    assert.match(p, /PRICE FACTS/);
    assert.match(p, /XAUUSD: last 3,860\.07/);
    assert.match(p, /NAS100: LIVE PRICE UNAVAILABLE/);
    assert.match(p, /Never use a price from memory/);
  });
});

describe("chat price guard — post-check", () => {
  it("leaves a clean answer alone and never regenerates", async () => {
    let calls = 0;
    const r = await guardChatReply({ reply: GOOD_GOLD, facts: [GOLD], regenerate: async () => (calls++, "x") });
    assert.equal(r.changed, false);
    assert.equal(r.text, GOOD_GOLD);
    assert.equal(calls, 0);
  });

  it("catches a stale gold level (1950 vs live 3,860) and regenerates once with feedback", async () => {
    const feedback: string[] = [];
    const r = await guardChatReply({
      reply: STALE_GOLD,
      facts: [GOLD],
      regenerate: async (f) => {
        feedback.push(f);
        return GOOD_GOLD;
      },
    });
    assert.equal(feedback.length, 1);
    assert.match(feedback[0], /1950 for XAUUSD is wrong: the live price is 3860\.07/);
    assert.equal(r.changed, true);
    assert.equal(r.regenerated, true);
    assert.equal(r.stripped, false);
    assert.equal(r.text, GOOD_GOLD);
  });

  it("strips the sentence and adds a correction note when the regenerate is still wrong", async () => {
    let calls = 0;
    const r = await guardChatReply({
      reply: STALE_GOLD,
      facts: [GOLD],
      regenerate: async () => (calls++, "Gold looks heavy. Watch XAUUSD near 1920 for support."),
    });
    assert.equal(calls, 1);
    assert.equal(r.stripped, true);
    assert.doesNotMatch(r.text, /1920|1950/);
    assert.match(r.text, /Gold looks heavy\./);
    assert.match(r.text, /Price check: .*XAUUSD 3,860\.07/);
  });

  it("strips without a regenerator and when the regenerate fails", async () => {
    const a = await guardChatReply({ reply: STALE_GOLD, facts: [GOLD] });
    assert.doesNotMatch(a.text, /1950/);
    const b = await guardChatReply({ reply: STALE_GOLD, facts: [GOLD], regenerate: async () => { throw new Error("llm down"); } });
    assert.equal(b.regenerated, false);
    assert.doesNotMatch(b.text, /1950/);
  });

  it("allows no level at all for a market without live data", async () => {
    const r = await guardChatReply({
      reply: "Bitcoin could run to 30,000 this week.",
      facts: [GOLD, { ok: false, symbol: "BTCUSD", reason: "no fresh price" }],
    });
    assert.doesNotMatch(r.text, /30,000/);
    assert.match(r.text, /BTCUSD live data unavailable/);
  });

  it("accepts a correct level in a later paragraph that does not repeat the market", () => {
    const text = "Gold is ranging around 3,860 today.\n\nKeep your stop below 3,840 and target 3,900.";
    assert.deepEqual(findChatPriceViolations(text, [GOLD, BTC]), []);
    assert.equal(findChatPriceViolations("XAUUSD looks fine.\n\nResistance near 1950 matters.", [GOLD]).length, 1);
  });

  it("streams a correction note naming the live prices", () => {
    assert.match(chatPriceStreamNote([GOLD, BTC]), /saved answer has been corrected.*XAUUSD 3,860\.07.*BTCUSD 65,001\.73/);
  });
});

describe("chat price facts cache", () => {
  it("serves repeat asks from cache per user, and refetches after the TTL", async () => {
    const cache = createChatPriceFactsCache({ okMs: 60_000, failMs: 20_000 });
    const asked: string[][] = [];
    const loader = async (symbols: string[]) => {
      asked.push(symbols);
      return symbols.map((s) => (s === "XAUUSD" ? GOLD : ({ ok: false, symbol: s, reason: "none" }) as SymbolFactsResult));
    };
    const t0 = NOW.getTime();
    await cache("u1", ["XAUUSD", "NAS100"], loader, new Date(t0));
    const again = await cache("u1", ["xauusd"], loader, new Date(t0 + 30_000));
    assert.equal(asked.length, 1);
    assert.equal(again[0].ok, true);
    await cache("u1", ["XAUUSD", "NAS100"], loader, new Date(t0 + 30_000)); // failure TTL 20s elapsed
    assert.deepEqual(asked[1], ["NAS100"]);
    await cache("u2", ["XAUUSD"], loader, new Date(t0 + 30_000)); // other user, own entry
    assert.deepEqual(asked[2], ["XAUUSD"]);
    await cache("u1", ["XAUUSD"], loader, new Date(t0 + 61_000));
    assert.deepEqual(asked[3], ["XAUUSD"]);
    assert.deepEqual(await cache("u1", [], loader), []);
  });

  it("turns a loader error into 'unavailable' instead of throwing", async () => {
    const cache = createChatPriceFactsCache();
    const r = await cache("u1", ["XAUUSD"], async () => { throw new Error("boom"); }, NOW);
    assert.equal(r[0].ok, false);
  });
});

describe("chat route wiring", () => {
  const src = readFileSync(new URL("../../services/chatService.ts", import.meta.url), "utf8");
  it("injects PRICE FACTS into the chat system prompt", () => {
    assert.match(src, /buildChatPriceFactsPrompt\(chatPriceFacts\)/);
    assert.match(src, /loadChatPriceFacts\(/);
  });
  it("post-checks the model answer before it is saved", () => {
    const guard = src.indexOf("guardChatReply({");
    const save = src.indexOf("// 4. Save assistant reply");
    assert.ok(guard > 0 && save > guard, "guardChatReply must run before the reply is saved");
  });
});
