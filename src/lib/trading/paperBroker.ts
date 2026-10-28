/**
 * Paper trading that does not flatter you.
 *
 * Build-list item 10 asks for an account you can actually trade on without
 * money, so that the journal, `playbookEdge` and the learning arc run on real
 * behaviour instead of on nothing. Today's `demo_paper` account is not that:
 * `/api/mt5/order` refuses it outright with a 409, so it is somewhere to look
 * at a chart and nowhere to practise.
 *
 * The whole value of this file is in one decision, and it is the one most
 * paper traders get wrong: **a paper fill happens on the same side of the
 * spread as a real one.** A buy fills at the ask, a sell fills at the bid, and
 * closing crosses back. Software that fills both sides at the mid price makes
 * every strategy look about one spread per trade better than it is — which is
 * exactly the margin that separates a scalping idea that works from one that
 * quietly bleeds. Someone who practises against a flattering simulator learns
 * a habit that costs them money the day they fund the account.
 *
 * So the rules here are deliberately unkind:
 *
 *   - You cross the spread going in, and again coming out.
 *   - A stop is checked against the price that would actually trigger it: a
 *     long's stop is hit when the *bid* reaches it, not when the mid does.
 *   - Gaps fill at the gapped price, not at your stop. A stop is an
 *     instruction, not a promise, and paper that pretends otherwise teaches
 *     the single most expensive lesson in the wrong direction.
 *
 * What it is still not: no swap, no commission, no slippage beyond the
 * spread, no partial fills, no margin call. Those are listed in
 * `PAPER_LIMITS` and shown to the trader rather than left implied, because a
 * simulator that hides what it does not model is the same lie in a smaller
 * font.
 *
 * Dependency-free apart from `accountRiskBand`, so the verify suite runs it.
 */

import { pointValuePerLot } from "@/lib/risk/accountRiskBand";

export type PaperSide = "buy" | "sell";

export type PaperQuote = {
  bid: number;
  ask: number;
};

export type PaperPosition = {
  id: string;
  symbol: string;
  side: PaperSide;
  volume: number;
  /** The price this actually filled at — already across the spread. */
  openPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  openedAt: string;
};

/** Why a position closed. The trader sees this word in the journal. */
export type PaperCloseReason = "stop-loss" | "take-profit" | "manual";

export type PaperClose = {
  reason: PaperCloseReason;
  /** What it closed at, including the gap if there was one. */
  price: number;
  pnl: number;
  /** True when the fill was worse than the stop asked for. */
  gapped: boolean;
};

/**
 * What this simulator does not model, in the trader's words.
 *
 * Shown in the UI next to a paper account. Everything here makes paper
 * results *better* than live, which is the direction that misleads, so it has
 * to be said out loud rather than discovered after funding an account.
 */
export const PAPER_LIMITS: readonly string[] = [
  "No overnight swap or financing — a position held for weeks costs you nothing here, and that is not true live.",
  "No commission. On a raw-spread account that is a real per-trade cost.",
  "No slippage beyond the spread: your fill is the quote at that moment, where live you can do worse in fast markets.",
  "Orders fill in full or not at all. Live, a large order can fill in pieces at different prices.",
  "No margin call. Here you can hold a losing position forever; a broker would close it for you.",
];

export function isPaperSide(value: unknown): value is PaperSide {
  return value === "buy" || value === "sell";
}

/**
 * The price an order of this side fills at.
 *
 * Buys pay the ask, sells receive the bid. The asymmetry *is* the spread, and
 * it has to be paid on the way in and again on the way out.
 */
export function fillPrice(side: PaperSide, quote: PaperQuote): number {
  return side === "buy" ? quote.ask : quote.bid;
}

/** The price a position of this side would close at — the other side. */
export function closeFillPrice(side: PaperSide, quote: PaperQuote): number {
  return side === "buy" ? quote.bid : quote.ask;
}

/** Profit or loss in account currency at a given exit price. */
export function paperPnl(position: PaperPosition, exitPrice: number): number {
  const direction = position.side === "buy" ? 1 : -1;
  const raw =
    (exitPrice - position.openPrice) *
    direction *
    pointValuePerLot(position.symbol) *
    position.volume;
  // Two decimals, like a broker statement. Without this the journal fills up
  // with values like 18.400000000000006 and every sum drifts.
  return Math.round(raw * 100) / 100;
}

/** Open P/L right now, marked against the side this position would close on. */
export function markToMarket(position: PaperPosition, quote: PaperQuote): number {
  return paperPnl(position, closeFillPrice(position.side, quote));
}

export type OpenPaperArgs = {
  id: string;
  symbol: string;
  side: PaperSide;
  volume: number;
  quote: PaperQuote;
  stopLoss?: number | null;
  takeProfit?: number | null;
  openedAt: string;
};

/** Why an order could not be opened. Empty means it can. */
export function paperOrderRejections(args: OpenPaperArgs): string[] {
  const reasons: string[] = [];

  if (!isPaperSide(args.side)) reasons.push("side must be buy or sell");
  if (!Number.isFinite(args.volume) || args.volume <= 0) {
    reasons.push("volume must be greater than zero");
  }
  if (!Number.isFinite(args.quote.bid) || !Number.isFinite(args.quote.ask)) {
    reasons.push("no live quote for this symbol — paper fills need a real price");
  } else if (args.quote.ask < args.quote.bid) {
    reasons.push("quote is inverted: ask below bid");
  }

  // A stop on the wrong side of the entry would trigger immediately, which is
  // never what the trader meant — it is a typo, and a broker rejects it too.
  const entry = fillPrice(args.side, args.quote);
  const sl = args.stopLoss ?? null;
  const tp = args.takeProfit ?? null;
  if (sl != null && Number.isFinite(sl)) {
    const wrongSide = args.side === "buy" ? sl >= entry : sl <= entry;
    if (wrongSide) reasons.push(`stop loss ${sl} is on the wrong side of the entry at ${entry}`);
  }
  if (tp != null && Number.isFinite(tp)) {
    const wrongSide = args.side === "buy" ? tp <= entry : tp >= entry;
    if (wrongSide) reasons.push(`take profit ${tp} is on the wrong side of the entry at ${entry}`);
  }

  return reasons;
}

export function openPaperPosition(args: OpenPaperArgs): PaperPosition {
  return {
    id: args.id,
    symbol: args.symbol,
    side: args.side,
    volume: args.volume,
    openPrice: fillPrice(args.side, args.quote),
    stopLoss: args.stopLoss != null && Number.isFinite(args.stopLoss) ? args.stopLoss : null,
    takeProfit: args.takeProfit != null && Number.isFinite(args.takeProfit) ? args.takeProfit : null,
    openedAt: args.openedAt,
  };
}

/**
 * Whether this quote closes the position, and at what price.
 *
 * The honest parts:
 *
 *  - A long's stop is measured against the **bid**, because that is what the
 *    trader would get out at. Measuring against the mid or the ask makes a
 *    stop survive moves that would really have taken it out.
 *  - A gap fills at the gapped price. If a long's stop is 1900 and the bid
 *    opens at 1880, the fill is 1880. Paper that pays out 1900 teaches that
 *    stops cap losses exactly, which is the belief that empties accounts on
 *    the first gap.
 * Note what this function *cannot* decide. It sees one quote, and a long
 * always exits on the bid — so a single quote can reach the stop or the
 * target, never both. The case where both were touched happens *between*
 * quotes, and only a bar's high and low can show it. That is
 * `evaluatePaperStopsOnBar` below, and it is where the stop-before-target
 * rule actually lives.
 */
export function evaluatePaperStops(
  position: PaperPosition,
  quote: PaperQuote,
): PaperClose | null {
  const exit = closeFillPrice(position.side, quote);
  if (!Number.isFinite(exit)) return null;

  const hitsStop =
    position.stopLoss != null &&
    (position.side === "buy" ? exit <= position.stopLoss : exit >= position.stopLoss);

  if (hitsStop) {
    return {
      reason: "stop-loss",
      price: exit,
      pnl: paperPnl(position, exit),
      gapped: exit !== position.stopLoss,
    };
  }

  const hitsTarget =
    position.takeProfit != null &&
    (position.side === "buy" ? exit >= position.takeProfit : exit <= position.takeProfit);

  if (hitsTarget) {
    // A target fills at the target: the trader asked to leave at that price,
    // and a better price through a gap is luck this simulator does not grant
    // — the same reason a gap through a stop is not forgiven.
    const price = position.takeProfit as number;
    return {
      reason: "take-profit",
      price,
      pnl: paperPnl(position, price),
      gapped: exit !== price,
    };
  }

  return null;
}

/** Close by hand, at whatever the market is now. */
export function closePaperPosition(position: PaperPosition, quote: PaperQuote): PaperClose {
  const price = closeFillPrice(position.side, quote);
  return { reason: "manual", price, pnl: paperPnl(position, price), gapped: false };
}

export type PaperBar = {
  high: number;
  low: number;
  /** Spread to apply at the extremes, as ask minus bid. Zero is honest when unknown. */
  spread?: number;
};

/**
 * Whether a completed bar took this position out, and at what price.
 *
 * `evaluatePaperStops` polls a live quote and sees one price at a time. A bar
 * covers everything that happened in between, and that is where the decision
 * that matters appears: a bar whose low reached the stop *and* whose high
 * reached the target touched both, and nothing in the data says which came
 * first.
 *
 * It takes the stop. Inside one bar there is no evidence, and a simulator
 * that resolves its own ignorance in the trader's favour turns losing weeks
 * into winning ones — which is the single most misleading thing a practice
 * account can do. Assume the worse order, and a strategy that still looks
 * good is one you can trust.
 *
 * Gaps keep the same treatment as above: a stop fills where the market was,
 * a target never pays out more than it asked for.
 */
export function evaluatePaperStopsOnBar(
  position: PaperPosition,
  bar: PaperBar,
): PaperClose | null {
  if (!Number.isFinite(bar.high) || !Number.isFinite(bar.low) || bar.high < bar.low) return null;

  const spread = Number.isFinite(bar.spread) ? Math.max(0, bar.spread as number) : 0;
  // A long exits on the bid, so its worst price in the bar is the low; a short
  // exits on the ask, so its worst is the high plus the spread.
  const exitLow = position.side === "buy" ? bar.low : bar.low + spread;
  const exitHigh = position.side === "buy" ? bar.high : bar.high + spread;

  const stop = position.stopLoss;
  const target = position.takeProfit;

  const touchedStop =
    stop != null && (position.side === "buy" ? exitLow <= stop : exitHigh >= stop);
  const touchedTarget =
    target != null && (position.side === "buy" ? exitHigh >= target : exitLow <= target);

  if (touchedStop) {
    // Fill at the stop, or worse if the bar opened through it.
    const price = position.side === "buy" ? Math.min(stop as number, exitHigh) : Math.max(stop as number, exitLow);
    const filled = position.side === "buy" ? Math.min(price, stop as number) : Math.max(price, stop as number);
    return {
      reason: "stop-loss",
      price: filled,
      pnl: paperPnl(position, filled),
      gapped: filled !== stop,
    };
  }

  if (touchedTarget) {
    const price = target as number;
    return { reason: "take-profit", price, pnl: paperPnl(position, price), gapped: false };
  }

  return null;
}
