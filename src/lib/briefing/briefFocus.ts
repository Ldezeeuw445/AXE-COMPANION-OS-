/**
 * Which markets a brief may talk about, and nothing else.
 *
 * Before: `preferredPairs` was the top three symbols of the last 30 days of
 * closed trades, and `briefPriceSymbols` always added XAUUSD and BTCUSD on
 * top. The watchlist the trader fills in under Settings ("Add the pairs you
 * care about most") never reached the brief, and the calendar was not
 * filtered by currency — so a trader with XAUUSD/BRENT/US30 on their
 * watchlist got BTCUSD every morning and the AUD CPI / AUD unemployment
 * releases as "today's agenda" (briefs of 17–19 Nov 2026 talked about AUDCAD
 * because one AUDCAD trade was still inside the 30-day window).
 *
 * Now the trader chooses, in Settings → Morning brief focus:
 *   - auto: watchlist + markets actually traded + open positions (default);
 *   - custom: exactly the markets they picked, with a primary/secondary
 *     priority; open positions are always added (risk you are carrying is
 *     never off-topic) and labelled as such.
 * Plus an exclude list that always wins, and macro drivers (DXY / US10Y for
 * gold …) that are labelled as drivers, never as "your pairs".
 *
 * Dependency-free (node --test).
 */

import { canonicalSymbol, classifyAsset } from "@/lib/market/marketHours";

export type FocusPriority = "primary" | "secondary";

export type BriefFocusPrefs = {
  mode: "auto" | "custom";
  pairs: Array<{ symbol: string; priority: FocusPriority }>;
  exclude: string[];
  /** Mention macro drivers (DXY, US10Y …) for the chosen markets. */
  drivers: boolean;
  /** At most this many markets in one brief. */
  maxMarkets: number;
  /**
   * Weekends / holidays: when none of their markets is open, add BTCUSD as
   * the one live market (labelled "open while yours are closed").
   */
  weekendCrypto: boolean;
};

export const DEFAULT_BRIEF_FOCUS: BriefFocusPrefs = {
  mode: "auto",
  pairs: [],
  exclude: [],
  drivers: true,
  maxMarkets: 6,
  weekendCrypto: true,
};

export const BRIEF_FOCUS_LIMITS = { pairs: 12, exclude: 24, maxMarkets: 10 } as const;

function cleanSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = canonicalSymbol(raw);
  return /^[A-Z0-9]{1,12}$/.test(s) ? s : null;
}

export function normalizeBriefFocusPrefs(raw: unknown): BriefFocusPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_BRIEF_FOCUS, pairs: [], exclude: [] };
  const r = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const pairs: BriefFocusPrefs["pairs"] = [];
  for (const p of Array.isArray(r.pairs) ? r.pairs : []) {
    const sym = cleanSymbol(typeof p === "string" ? p : (p as { symbol?: unknown })?.symbol);
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    const pr = typeof p === "object" && p && (p as { priority?: unknown }).priority === "secondary" ? "secondary" : "primary";
    pairs.push({ symbol: sym, priority: pr });
    if (pairs.length >= BRIEF_FOCUS_LIMITS.pairs) break;
  }
  const exclude = [...new Set((Array.isArray(r.exclude) ? r.exclude : []).map(cleanSymbol).filter((s): s is string => !!s))].slice(
    0,
    BRIEF_FOCUS_LIMITS.exclude,
  );
  const max = Number(r.maxMarkets);
  return {
    mode: r.mode === "custom" ? "custom" : "auto",
    pairs: pairs.filter((p) => !exclude.includes(p.symbol)),
    exclude,
    drivers: r.drivers !== false,
    weekendCrypto: r.weekendCrypto !== false,
    maxMarkets: Number.isFinite(max) ? Math.min(BRIEF_FOCUS_LIMITS.maxMarkets, Math.max(1, Math.round(max))) : DEFAULT_BRIEF_FOCUS.maxMarkets,
  };
}

export type FocusReason = "selected" | "watchlist" | "traded" | "open_position" | "weekend_crypto";

export type FocusMarket = { symbol: string; priority: FocusPriority; reasons: FocusReason[] };

export type FocusDriver = { symbol: string; label: string; for: string[] };

export type BriefFocus = {
  markets: FocusMarket[];
  drivers: FocusDriver[];
  excluded: string[];
  /** Currencies whose calendar events concern these markets. */
  currencies: string[];
  mode: BriefFocusPrefs["mode"];
};

const DRIVERS_BY_CLASS: Record<string, Array<{ symbol: string; label: string }>> = {
  metal: [
    { symbol: "DXY", label: "US dollar index" },
    { symbol: "US10Y", label: "US 10-year yield / real yields" },
  ],
  crypto: [
    { symbol: "NAS100", label: "Nasdaq risk appetite" },
    { symbol: "DXY", label: "US dollar index" },
  ],
  index: [
    { symbol: "US10Y", label: "US 10-year yield" },
    { symbol: "VIX", label: "volatility index" },
  ],
  energy: [
    { symbol: "DXY", label: "US dollar index" },
    { symbol: "EIA", label: "EIA crude inventories" },
  ],
  fx: [{ symbol: "DXY", label: "US dollar index" }],
};

const INDEX_CCY: Array<[RegExp, string]> = [
  [/^(GER40|DE40|DAX|EU50|STOXX50|FRA40)/, "EUR"],
  [/^(UK100|FTSE)/, "GBP"],
  [/^(JP225|NIKKEI)/, "JPY"],
  [/^AUS200/, "AUD"],
  [/^HK50/, "HKD"],
];

/** Currencies whose macro releases move this market. */
export function symbolCurrencies(symbolRaw: string): string[] {
  const s = canonicalSymbol(symbolRaw);
  const cls = classifyAsset(s);
  if (cls === "fx") return [s.slice(0, 3), s.slice(3, 6)];
  if (cls === "index") {
    for (const [re, ccy] of INDEX_CCY) if (re.test(s)) return [ccy];
    return ["USD"];
  }
  if (cls === "metal" || cls === "energy" || cls === "crypto" || cls === "stock") {
    const quote = s.match(/(USD|EUR|GBP|JPY)$/)?.[1];
    return [quote && quote !== "USD" ? quote : "USD"].concat(quote && quote !== "USD" ? ["USD"] : []);
  }
  return [];
}

export function resolveBriefFocus(input: {
  prefs: BriefFocusPrefs;
  watchlist: string[];
  traded: string[];
  openPositions: string[];
  /** True when every non-crypto market is closed (weekend / full holiday). */
  tradFiClosed?: boolean;
}): BriefFocus {
  const { prefs } = input;
  const excluded = new Set(prefs.exclude.map((s) => canonicalSymbol(s)));
  const byKey = new Map<string, FocusMarket>();
  const add = (raw: string, reason: FocusReason, priority: FocusPriority) => {
    const sym = canonicalSymbol(raw);
    if (!sym || excluded.has(sym)) return;
    const cur = byKey.get(sym);
    if (cur) {
      if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
      if (priority === "primary") cur.priority = "primary";
      return;
    }
    byKey.set(sym, { symbol: sym, priority, reasons: [reason] });
  };

  if (prefs.mode === "custom" && prefs.pairs.length > 0) {
    for (const p of prefs.pairs) add(p.symbol, "selected", p.priority);
  } else {
    // Auto: what they trade first, then their watchlist.
    input.traded.forEach((s, i) => add(s, "traded", i < 2 ? "primary" : "secondary"));
    input.watchlist.forEach((s) => add(s, "watchlist", "secondary"));
  }
  // Positions they are carrying are always in scope (but never beat an exclude).
  for (const s of input.openPositions) add(s, "open_position", "primary");

  const rank = (m: FocusMarket) =>
    (m.reasons.includes("open_position") ? 0 : 10) + (m.priority === "primary" ? 0 : 5) + (m.reasons.includes("selected") ? 0 : 1);
  const ordered = [...byKey.values()];
  const order = new Map(ordered.map((m, i) => [m.symbol, i]));
  ordered.sort((a, b) => rank(a) - rank(b) || (order.get(a.symbol)! - order.get(b.symbol)!));
  const markets = ordered.slice(0, prefs.maxMarkets);
  if (
    input.tradFiClosed &&
    prefs.weekendCrypto &&
    !markets.some((m) => classifyAsset(m.symbol) === "crypto") &&
    !excluded.has("BTCUSD")
  ) {
    markets.push({ symbol: "BTCUSD", priority: "secondary", reasons: ["weekend_crypto"] });
  }

  const drivers: FocusDriver[] = [];
  if (prefs.drivers) {
    const byDriver = new Map<string, FocusDriver>();
    for (const m of markets) {
      for (const d of DRIVERS_BY_CLASS[classifyAsset(m.symbol)] ?? []) {
        if (markets.some((x) => x.symbol === d.symbol) || excluded.has(d.symbol)) continue;
        const cur = byDriver.get(d.symbol) ?? { symbol: d.symbol, label: d.label, for: [] };
        if (!cur.for.includes(m.symbol)) cur.for.push(m.symbol);
        byDriver.set(d.symbol, cur);
      }
    }
    drivers.push(...byDriver.values());
  }

  const currencies = [...new Set(markets.flatMap((m) => symbolCurrencies(m.symbol)))];
  return { markets, drivers, excluded: [...excluded], currencies, mode: prefs.mode };
}

/** Calendar events in a currency none of the markets depend on are not news for this trader. */
export function isEventInFocus(eventCurrency: string | null | undefined, focus: BriefFocus): boolean {
  const c = String(eventCurrency ?? "").trim().toUpperCase();
  if (!c || c === "ALL" || c === "GLOBAL") return true;
  return focus.currencies.includes(c);
}

// ─── Off-focus detection (server check + tests) ──────────────────────────────

const CCY = "USD|EUR|GBP|JPY|CHF|AUD|NZD|CAD|SEK|NOK|XAU|XAG";
const PAIR_RE = new RegExp(`\\b(?:${CCY})\\s?\\/?\\s?(?:${CCY})\\b`, "g");
const TICKER_RE = /\b(BTCUSD|ETHUSD|SOLUSD|XRPUSD|US30|US500|SPX500|NAS100|US100|GER40|DE40|UK100|JP225|WTI|BRENT|USOUSD|UKOUSD|XAGUSD|XAUUSD)\b/g;

/** Every market ticker this text names (EUR/USD → EURUSD). */
export function mentionedTickers(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.toUpperCase().matchAll(PAIR_RE)) {
    const t = m[0].replace(/[\s/]/g, "");
    if (t.length === 6 && t.slice(0, 3) !== t.slice(3)) out.add(t);
  }
  for (const m of text.toUpperCase().matchAll(TICKER_RE)) out.add(m[1]);
  return [...out];
}

/** Tickers the text names that are neither a focus market nor a labelled driver. */
export function offFocusTickers(text: string, focus: BriefFocus): string[] {
  const allowed = new Set([...focus.markets.map((m) => m.symbol), ...focus.drivers.map((d) => d.symbol)]);
  return mentionedTickers(text).filter((t) => !allowed.has(t));
}

export function describeFocusForPrompt(focus: BriefFocus): string {
  if (focus.markets.length === 0) {
    return "Their markets: none chosen and none traded yet — do not name any market as theirs.";
  }
  const why: Record<FocusReason, string> = {
    selected: "chosen in settings",
    watchlist: "watchlist",
    traded: "traded recently",
    open_position: "open position",
    weekend_crypto: "the only market open while theirs are closed — say so, it is not one of their usual markets",
  };
  const lines = focus.markets.map((m) => `- ${m.symbol} (${m.priority}; ${m.reasons.map((r) => why[r]).join(", ")})`);
  const drivers = focus.drivers.length
    ? `\nDrivers you may mention, only as drivers of those markets: ${focus.drivers.map((d) => `${d.symbol} (${d.label}, for ${d.for.join("/")})`).join("; ")}.`
    : "";
  const excl = focus.excluded.length ? `\nNever mention: ${focus.excluded.join(", ")}.` : "";
  return `Their markets (the ONLY markets this brief may cover):\n${lines.join("\n")}${drivers}${excl}\nDo not name any other pair, index or coin.`;
}

const CENTRAL_BANK_CCY: Array<[RegExp, string]> = [
  [/\b(RBA|Reserve Bank of Australia|Aussie dollar|Australian dollar)\b/i, "AUD"],
  [/\b(RBNZ|Kiwi dollar|New Zealand dollar)\b/i, "NZD"],
  [/\b(BoC|Bank of Canada|loonie|Canadian dollar)\b/i, "CAD"],
  [/\b(SNB|Swiss franc)\b/i, "CHF"],
  [/\b(BoJ|Bank of Japan|yen)\b/i, "JPY"],
  [/\b(BoE|Bank of England|sterling)\b/i, "GBP"],
  [/\b(ECB|euro area|eurozone)\b/i, "EUR"],
];

/**
 * A headline that is only about markets outside the focus (an AUD/USD move,
 * an RBA decision for a gold/oil trader) is not their news.
 */
export function isHeadlineInFocus(title: string, summary: string | null | undefined, focus: BriefFocus): boolean {
  const text = `${title} ${summary ?? ""}`;
  const allowed = new Set([...focus.markets.map((m) => m.symbol), ...focus.drivers.map((d) => d.symbol)]);
  const tickers = mentionedTickers(text);
  if (tickers.some((t) => allowed.has(t))) return true;
  if (tickers.length > 0) return false;
  for (const [re, ccy] of CENTRAL_BANK_CCY) {
    if (re.test(text) && !focus.currencies.includes(ccy)) return false;
  }
  return true;
}
