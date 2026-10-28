/**
 * Where a paper fill gets its price — and saying so, every time.
 *
 * `paperBroker.ts` decides what a fill costs. This decides what the fill is
 * priced against, and that turns out to be the harder question.
 *
 * Today's demo account prices itself with `getDemoQuotePrice`, which is a
 * seeded random walk around a hard-coded base. Perfectly good for showing
 * someone a moving chart. Useless as evidence: a win on invented prices says
 * nothing about whether the trader can trade, and `playbookEdge` cannot tell
 * the difference — it counts closed trades and reports an edge.
 *
 * That is the real risk in build-list item 10. Not that paper trading is
 * inaccurate, but that its results flow into the same journal, the same
 * `playbookEdge`, the same learning arc, and come back out as "your London
 * XAUUSD longs win 64% of the time" — a sentence about the trader, derived
 * from a random number generator.
 *
 * So every quote carries its origin, and nothing downstream is allowed to
 * forget it:
 *
 *   live       a real bid/ask from the broker feed, through
 *              `chart_live_snapshots`. Trades on this are evidence.
 *   simulated  the demo generator. Fine for practising the mechanics,
 *              worthless as a measurement, and marked as such forever.
 *   none       no price at all. Then there is no fill — a paper trade at a
 *              made-up price is worse than no paper trade.
 *
 * `MAX_QUOTE_AGE_MS` is the other half: a "live" price from four minutes ago
 * is not live, and filling against it while the market has moved is how a
 * simulator hands out profits that were never available.
 *
 * Dependency-free so the verify suite runs it.
 */

import type { PaperQuote } from "@/lib/trading/paperBroker";

export type QuoteOrigin = "live" | "simulated" | "none";

export type ResolvedQuote =
  | { origin: "live"; quote: PaperQuote; ageMs: number }
  | { origin: "simulated"; quote: PaperQuote; reason: string }
  | { origin: "none"; reason: string };

/**
 * How stale a broker tick may be and still count as live.
 *
 * Ninety seconds: long enough to survive a quiet instrument between ticks and
 * a slow round trip, short enough that a feed which actually died is caught
 * before it fills an order at yesterday's price. A market that has genuinely
 * not ticked in 90 seconds is one you should not be filling into anyway.
 */
export const MAX_QUOTE_AGE_MS = 90_000;

export type SnapshotRow = {
  last_bid: number | null;
  last_ask: number | null;
  last_tick_at: string | null;
};

/**
 * Turn a stored snapshot into a quote, or explain why it cannot be one.
 *
 * Returns `none` rather than falling back to the simulator: the caller decides
 * whether invented prices are acceptable for what it is doing, and that choice
 * should be visible at the call site instead of hidden in here.
 */
export function quoteFromSnapshot(
  row: SnapshotRow | null | undefined,
  now: number = Date.now(),
): ResolvedQuote {
  if (!row) return { origin: "none", reason: "no price feed for this symbol on this account" };

  // `Number(null)` is 0 and `Number.isFinite(0)` is true, so a null bid would
  // sail through as a price of zero and fill an order at nothing. Check for
  // the absence first, and reject non-positive prices outright — no
  // instrument this app trades is ever worth zero.
  if (row.last_bid == null || row.last_ask == null) {
    return { origin: "none", reason: "the feed has no bid/ask for this symbol yet" };
  }
  const bid = Number(row.last_bid);
  const ask = Number(row.last_ask);
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) {
    return { origin: "none", reason: "the feed has no usable bid/ask for this symbol" };
  }
  if (ask < bid) {
    return { origin: "none", reason: "the feed returned an inverted quote" };
  }

  const tickMs = row.last_tick_at ? Date.parse(row.last_tick_at) : Number.NaN;
  if (!Number.isFinite(tickMs)) {
    return { origin: "none", reason: "the feed did not say when this price was true" };
  }

  const ageMs = now - tickMs;
  if (ageMs > MAX_QUOTE_AGE_MS) {
    const seconds = Math.round(ageMs / 1000);
    return {
      origin: "none",
      reason: `the last tick is ${seconds}s old — too stale to fill against`,
    };
  }
  // A tick from the future means clock skew somewhere; treat it as unusable
  // rather than as very fresh.
  if (ageMs < -5_000) {
    return { origin: "none", reason: "the feed's timestamp is in the future" };
  }

  return { origin: "live", quote: { bid, ask }, ageMs: Math.max(0, ageMs) };
}

/** Wrap the demo generator's output, permanently marked as not evidence. */
export function simulatedQuote(quote: PaperQuote): ResolvedQuote {
  return {
    origin: "simulated",
    quote,
    reason: "generated prices — fine for practising the mechanics, not a measure of your trading",
  };
}

/**
 * Whether a trade filled on this quote may count towards what AXE says about
 * the trader.
 *
 * Only live prices. `playbookEdge` turns closed trades into sentences like
 * "your London XAUUSD longs win 64% of the time" — a claim about a person.
 * Letting simulated fills into that is how a random walk gets reported back
 * as somebody's edge.
 */
export function countsAsEvidence(origin: QuoteOrigin): boolean {
  return origin === "live";
}

/**
 * The line that travels with the trade into the journal.
 *
 * Written so it still makes sense months later, when nobody remembers which
 * account this was. "Paper fill" is not enough — the question a trader will
 * have is whether the number meant anything.
 */
export function describeQuoteOrigin(resolved: ResolvedQuote): string {
  if (resolved.origin === "live") {
    return `Paper fill at the live broker spread (tick ${Math.round(resolved.ageMs / 1000)}s old). Counts towards what AXE learns about you.`;
  }
  if (resolved.origin === "simulated") {
    return "Paper fill at generated prices. Does not count towards what AXE learns about you — the price was not real.";
  }
  return `No fill: ${resolved.reason}`;
}
