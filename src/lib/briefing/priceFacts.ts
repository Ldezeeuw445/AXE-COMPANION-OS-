/**
 * The market facts a briefing is allowed to use — computed from real candles,
 * never from the model.
 *
 * Measured 2026-11-17: the Weekly Outlook of Monday 16 Nov told the trader
 * "XAUUSD key resistance near 1950 … below 1920" and "BTCUSD near 30,000" with
 * gold at ~3,860 and bitcoin at ~65,000. The weekly prompt carried no market
 * data at all and asked for "2-3 high-probability setups", so the model filled
 * the levels in from its training data. Every number a briefing names about a
 * market now has to come from the block this module builds, and
 * `briefPriceValidator` rejects text that does not.
 */

export type PriceCandle = {
  /** ISO time of the bar open (UTC). */
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type PriceSource = "mt5_broker" | "twelve_data" | "yahoo_futures" | "yahoo";

export type SymbolPriceFacts = {
  symbol: string;
  source: PriceSource;
  /** Human label, e.g. "your MT5 broker feed (GOLD)" or "Twelve Data spot XAU/USD". */
  sourceLabel: string;
  lastPrice: number;
  /** When `lastPrice` was observed (ISO). */
  asOf: string;
  /** Market open right now for this instrument (crypto: always). */
  marketOpen: boolean;
  dayHigh: number | null;
  dayLow: number | null;
  prevDayHigh: number | null;
  prevDayLow: number | null;
  weekHigh: number | null;
  weekLow: number | null;
  prevWeekHigh: number | null;
  prevWeekLow: number | null;
  /** High / low of the last 20 daily bars (the key levels). */
  range20High: number | null;
  range20Low: number | null;
};

export type SymbolFactsResult =
  | { ok: true; facts: SymbolPriceFacts }
  | { ok: false; symbol: string; reason: string };

/** Crypto trades around the clock; metals, FX and CFDs close for the weekend. */
export function isCryptoSymbol(symbol: string): boolean {
  return /^(BTC|ETH|SOL|XRP|LTC|ADA|DOGE|BNB)/.test(symbol.toUpperCase());
}

/**
 * Spot FX / metals week: Sunday 22:00 UTC to Friday 22:00 UTC (21:00 in the
 * northern summer — 22:00 is the conservative edge for "is it closed").
 */
export function isFxMarketOpen(now: Date): boolean {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (day === 6) return false;
  if (day === 0) return hour >= 22;
  if (day === 5) return hour < 21;
  return true;
}

/** How old a last price may be while its market is open. */
export const PRICE_MAX_AGE_OPEN_MS = 30 * 60 * 1000;
/** While closed, the last price may be from the last session (weekend + a holiday). */
export const PRICE_MAX_AGE_CLOSED_MS = 80 * 60 * 60 * 1000;

export function isPriceFresh(symbol: string, asOf: string, now: Date): boolean {
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return false;
  const age = now.getTime() - t;
  if (age < -5 * 60 * 1000) return false;
  const open = isCryptoSymbol(symbol) || isFxMarketOpen(now);
  return age <= (open ? PRICE_MAX_AGE_OPEN_MS : PRICE_MAX_AGE_CLOSED_MS);
}

function utcDayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Monday 00:00 UTC of the week containing `d`. */
function weekStartUtc(d: Date): number {
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

function hiLo(bars: PriceCandle[]): { high: number | null; low: number | null } {
  if (bars.length === 0) return { high: null, low: null };
  let high = -Infinity;
  let low = Infinity;
  for (const b of bars) {
    if (Number.isFinite(b.high)) high = Math.max(high, b.high);
    if (Number.isFinite(b.low)) low = Math.min(low, b.low);
  }
  return { high: Number.isFinite(high) ? high : null, low: Number.isFinite(low) ? low : null };
}

/**
 * Build the facts from daily candles (oldest or newest first, any order) and
 * the observed last price. Returns null when the inputs are not usable.
 */
export function computeSymbolFacts(input: {
  symbol: string;
  source: PriceSource;
  sourceLabel: string;
  dailyCandles: PriceCandle[];
  lastPrice: number | null;
  asOf: string | null;
  now: Date;
}): SymbolPriceFacts | null {
  const bars = input.dailyCandles
    .filter((b) => Number.isFinite(Date.parse(b.time)) && b.high > 0 && b.low > 0 && b.close > 0)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const last = bars[bars.length - 1];
  const lastPrice = input.lastPrice != null && input.lastPrice > 0 ? input.lastPrice : last?.close ?? null;
  if (lastPrice == null || !input.asOf) return null;

  const latestDay = last ? utcDayKey(last.time) : null;
  const today = latestDay ? bars.filter((b) => utcDayKey(b.time) === latestDay) : [];
  const before = latestDay ? bars.filter((b) => utcDayKey(b.time) < latestDay) : bars;
  const prevDay = before.length > 0 ? [before[before.length - 1]] : [];

  const ref = last ? new Date(last.time) : input.now;
  const thisWeekStart = weekStartUtc(ref);
  const prevWeekStart = thisWeekStart - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = bars.filter((b) => Date.parse(b.time) >= thisWeekStart);
  const prevWeek = bars.filter((b) => {
    const t = Date.parse(b.time);
    return t >= prevWeekStart && t < thisWeekStart;
  });
  const last20 = bars.slice(-20);

  const d = hiLo(today);
  const pd = hiLo(prevDay);
  const w = hiLo(thisWeek);
  const pw = hiLo(prevWeek);
  const r = hiLo(last20);
  return {
    symbol: input.symbol.toUpperCase(),
    source: input.source,
    sourceLabel: input.sourceLabel,
    lastPrice,
    asOf: input.asOf,
    marketOpen: isCryptoSymbol(input.symbol) || isFxMarketOpen(input.now),
    // The live price can sit outside a bar the provider has not updated yet.
    dayHigh: d.high != null ? Math.max(d.high, lastPrice) : null,
    dayLow: d.low != null ? Math.min(d.low, lastPrice) : null,
    prevDayHigh: pd.high,
    prevDayLow: pd.low,
    weekHigh: w.high != null ? Math.max(w.high, lastPrice) : null,
    weekLow: w.low != null ? Math.min(w.low, lastPrice) : null,
    prevWeekHigh: pw.high,
    prevWeekLow: pw.low,
    range20High: r.high,
    range20Low: r.low,
  };
}

export function formatPrice(value: number): string {
  const dp = value >= 1000 ? 2 : value >= 100 ? 2 : value >= 10 ? 3 : 5;
  return value.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtRange(label: string, high: number | null, low: number | null): string | null {
  if (high == null || low == null) return null;
  return `${label} ${formatPrice(low)} – ${formatPrice(high)}`;
}

export function formatUtc(iso: string): string {
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** One line per symbol, shared by the prompt and the deterministic fallback. */
export function describeSymbolFacts(f: SymbolPriceFacts): string {
  const parts = [
    `${f.symbol}: last ${formatPrice(f.lastPrice)} (${f.sourceLabel}, ${formatUtc(f.asOf)}${f.marketOpen ? "" : ", market closed — last close"})`,
    fmtRange("today", f.dayHigh, f.dayLow),
    fmtRange("previous day", f.prevDayHigh, f.prevDayLow),
    fmtRange("this week", f.weekHigh, f.weekLow),
    fmtRange("previous week", f.prevWeekHigh, f.prevWeekLow),
    fmtRange("20-day range", f.range20High, f.range20Low),
  ].filter(Boolean);
  return parts.join(" · ");
}

export function formatPriceFactBlock(results: SymbolFactsResult[]): string {
  const lines = results.map((r) =>
    r.ok
      ? `- ${describeSymbolFacts(r.facts)}`
      : `- ${r.symbol}: LIVE PRICE UNAVAILABLE (${r.reason}). Do not name any price or level for ${r.symbol}.`,
  );
  return `PRICE FACTS (real market data — the ONLY prices you may use):\n${lines.join("\n")}`;
}

/** The rules that travel with the fact block in every briefing prompt. */
export function priceFactRules(results: SymbolFactsResult[]): string {
  const anyOk = results.some((r) => r.ok);
  return `Price rules (hard — a server check rejects the brief otherwise):
- Every price, level, high, low or range you name must be one of the numbers in PRICE FACTS (you may round to the nearest whole number). Never use a price from memory or training data — those are years out of date.
- Key levels are the day, previous-day, week, previous-week and 20-day highs/lows listed there. Do not invent other levels.
- ${anyOk ? "A market marked LIVE PRICE UNAVAILABLE gets no number at all — say its live data is unavailable right now." : "No live prices are available right now: say so plainly and name no price or level for any market."}
- Name only calendar events and headlines from the market context, with their day/time. Do not add news that is not listed.`;
}

/** Stored with the brief: what the prices were, where they came from, and when. */
export type BriefPriceFactsHighlight = {
  type: "price_facts";
  checkedAt: string;
  prices: Array<{ symbol: string; price: number | null; source: string | null; asOf: string | null; marketOpen: boolean | null }>;
};

export function toPriceFactsHighlight(results: SymbolFactsResult[], now: Date): BriefPriceFactsHighlight {
  return {
    type: "price_facts",
    checkedAt: now.toISOString(),
    prices: results.map((r) =>
      r.ok
        ? { symbol: r.facts.symbol, price: r.facts.lastPrice, source: r.facts.sourceLabel, asOf: r.facts.asOf, marketOpen: r.facts.marketOpen }
        : { symbol: r.symbol.toUpperCase(), price: null, source: null, asOf: null, marketOpen: null },
    ),
  };
}

/** Briefs saved before prices were checked against live data carry no marker and are never served. */
export function hasPriceFactsMarker(highlights: unknown): boolean {
  return Array.isArray(highlights) && highlights.some((h) => h && typeof h === "object" && (h as { type?: unknown }).type === "price_facts");
}
