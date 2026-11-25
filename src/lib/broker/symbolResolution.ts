/**
 * Account-aware broker symbol resolution.
 * Strategy: stay within the account's known symbol universe (positions + history + watchlist).
 * Try exact match first, then suffix variants of the requested base.
 */

export const COMMON_SUFFIXES = [
  "",
  "m",
  "M",
  ".c",
  ".cash",
  ".s",
  ".r",
  ".pro",
  ".raw",
  ".ecn",
  ".m",
  ".x",
  ".a",
  ".p",
  ".z",
  ".std",
  ".micro",
  "_pro",
  "c",
  "i",
  "_i",
  "_ecn",
  "+",
  "-",
  "z",
  "p",
  "#",
];

export const COMMON_PREFIXES = ["", "#", ".", "m", "M", "pro.", "raw."];

export const SYMBOL_ALIASES: Record<string, string[]> = {
  XAUUSD: ["XAUUSD", "GOLD"],
  XAGUSD: ["XAGUSD", "SILVER"],
  BTCUSD: ["BTCUSD", "BTCUSDT", "BTC"],
  ETHUSD: ["ETHUSD", "ETHUSDT", "ETH"],
  AUDUSD: ["AUDUSD"],
  EURUSD: ["EURUSD"],
  GBPUSD: ["GBPUSD"],
  USDJPY: ["USDJPY"],
  AAPL: ["AAPL"],
  JPM: ["JPM"],
  NVDA: ["NVDA"],
  PLTR: ["PLTR"],
  TSLA: ["TSLA"],
  WTI: ["WTI", "USOIL", "XTIUSD", "USOUSD"],
  BRENT: ["BRENT", "UKOIL", "XBRUSD", "UKOUSD"],
  NASDAQ: ["NASDAQ", "NAS100", "US100", "USTEC", "NDX100", "NAS"],
  NAS100: ["NAS100", "US100", "NASDAQ", "USTEC", "NDX100", "NAS"],
  US100: ["US100", "NAS100", "NASDAQ", "USTEC", "NDX100", "NAS"],
  SPX: ["SPX", "SPX500", "US500", "SP500", "USA500", "S&P500"],
  SPX500: ["SPX500", "US500", "SP500", "USA500", "SPX", "S&P500"],
  US500: ["US500", "SPX500", "SP500", "USA500", "SPX", "S&P500"],
  US30: ["US30", "DJ30", "DOW", "DJI", "WS30", "US30USD"],
  DOW: ["DOW", "US30", "DJ30", "DJI", "WS30", "US30USD"],
};

const DISPLAY_PREF_BY_ALIAS_BASE: Record<string, string> = {
  GOLD: "XAUUSD",
  SILVER: "XAGUSD",
  NAS100: "NAS100",
  US100: "US100",
  USTEC: "NAS100",
  NDX100: "NAS100",
  SPX500: "SPX500",
  SP500: "SPX500",
  US500: "US500",
  USA500: "US500",
  DJ30: "US30",
  DOW: "US30",
  DJI: "US30",
  WS30: "US30",
  USOIL: "WTI",
  XTIUSD: "WTI",
  USOUSD: "WTI",
  UKOIL: "BRENT",
  XBRUSD: "BRENT",
  UKOUSD: "BRENT",
};

export type SymbolResolutionResult = {
  brokerSymbol: string;
  /** The display label requested by the user. */
  displaySymbol: string;
  /** True when broker symbol exactly matches the requested display symbol. */
  exact: boolean;
  /** Symbols we attempted (for diagnostics). */
  attempted: string[];
  /** Why resolution succeeded or fell back. */
  reason: "exact_match" | "suffix_variant" | "fallback_known" | "fallback_request";
};

function baseOf(sym: string): string {
  return sym.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function canonicalKey(sym: string): string {
  return baseOf(sym);
}

/** The decorations brokers put around a name (".micro" → MICRO), always allowed. */
const KNOWN_DECORATIONS = new Set(
  [...COMMON_SUFFIXES, ...COMMON_PREFIXES].map((d) => d.replace(/[^A-Z0-9]/gi, "").toUpperCase()).filter(Boolean),
);

const CURRENCY_CODES = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD", "HKD", "SGD", "CNH",
  "ZAR", "SEK", "NOK", "DKK", "PLN", "MXN", "TRY", "HUF", "CZK",
]);

/**
 * True when `symbol` is `alias` with at most a short broker decoration around
 * it: EURUSD.c, #AAPL, GOLDm, BTCUSD.nx, USOIL.c. Not when the extra part is a
 * currency (BTCEUR.nx is bitcoin in euros, AAPLEUR.nx Apple in euros), and
 * never for a short alias inside a longer name: on 25 Nov 2026 the old
 * "contains" match gave UKOUSD the Coca-Cola stock (KO) and USOUSD Dominion
 * Energy (D) on Luka's Upcomers account, so the watchlist showed stock prices
 * as oil.
 */
export function isDecoratedForm(symbol: string, alias: string): boolean {
  const s = baseOf(symbol);
  const a = baseOf(alias);
  if (!s || !a) return false;
  if (s === a) return true;
  if (a.length < 3) return false;
  let rest: string | null = null;
  if (s.startsWith(a)) rest = s.slice(a.length);
  else if (s.endsWith(a)) rest = s.slice(0, s.length - a.length);
  if (rest == null) return false;
  if (KNOWN_DECORATIONS.has(rest)) return true;
  if (CURRENCY_CODES.has(rest.slice(0, 3))) {
    // BTC + USD (BTCUSD.nx) and NAS100 + USD are the same instrument in
    // dollars; any other currency, or a second currency after a pair, is not.
    if (rest.slice(0, 3) !== "USD" || CURRENCY_CODES.has(a.slice(-3))) return false;
    rest = rest.slice(3);
    if (!rest || KNOWN_DECORATIONS.has(rest)) return true;
  }
  return rest.length <= 4;
}

/** True when `brokerSymbol` can stand for `displaySymbol` (one of its aliases, decorated or not). */
export function brokerSymbolMatchesDisplay(displaySymbol: string, brokerSymbol: string): boolean {
  if (!brokerSymbol.trim()) return false;
  return displaySymbolAliases(displaySymbol).some((alias) => isDecoratedForm(brokerSymbol, alias));
}

export function displaySymbolAliases(symbol: string): string[] {
  const key = canonicalKey(symbol);
  const direct = SYMBOL_ALIASES[key] ?? [symbol.trim().toUpperCase()];
  return Array.from(new Set(direct.map((s) => s.trim().toUpperCase()).filter(Boolean)));
}

export function cleanDisplaySymbol(symbol: string | null | undefined): string {
  const raw = (symbol ?? "").trim().toUpperCase();
  if (!raw) return "";
  const rawBase = baseOf(raw);
  if (DISPLAY_PREF_BY_ALIAS_BASE[rawBase]) return DISPLAY_PREF_BY_ALIAS_BASE[rawBase];
  for (const [display, aliases] of Object.entries(SYMBOL_ALIASES)) {
    if (aliases.some((alias) => rawBase === baseOf(alias))) return display;
  }
  for (const [aliasBase, display] of Object.entries(DISPLAY_PREF_BY_ALIAS_BASE)) {
    if (rawBase.startsWith(aliasBase) || rawBase.endsWith(aliasBase)) return display;
  }
  let best: { display: string; len: number } | null = null;
  for (const [display, aliases] of Object.entries(SYMBOL_ALIASES)) {
    for (const alias of aliases) {
      const aliasBase = baseOf(alias);
      if (rawBase.startsWith(aliasBase) || rawBase.endsWith(aliasBase)) {
        if (!best || aliasBase.length > best.len) best = { display, len: aliasBase.length };
      }
    }
  }
  if (best) return best.display;
  if (/^[A-Z]{1,5}$/.test(raw)) return raw;
  return raw.replace(/^[#.]/, "").replace(/([._-](X|S|M|R|PRO|RAW|ECN|STD|MICRO)|[MCPZ#])$/i, "");
}

export function detectSymbolPatterns(symbols: string[]): {
  suffixes: string[];
  prefixes: string[];
  examples: Record<string, string>;
} {
  const suffixes = new Set<string>();
  const prefixes = new Set<string>();
  const examples: Record<string, string> = {};
  const knownDisplays = Object.keys(SYMBOL_ALIASES);
  for (const symbol of symbols) {
    const upper = symbol.trim().toUpperCase();
    if (!upper) continue;
    for (const display of knownDisplays) {
      for (const alias of displaySymbolAliases(display)) {
        if (upper === alias) {
          examples[display] ??= symbol;
          continue;
        }
        if (upper.startsWith(alias)) {
          const suffix = symbol.slice(alias.length);
          if (suffix) suffixes.add(suffix);
          examples[display] ??= symbol;
        }
        if (upper.endsWith(alias)) {
          const prefix = symbol.slice(0, symbol.length - alias.length);
          if (prefix) prefixes.add(prefix);
          examples[display] ??= symbol;
        }
      }
    }
  }
  return {
    suffixes: Array.from(suffixes).slice(0, 16),
    prefixes: Array.from(prefixes).slice(0, 16),
    examples,
  };
}

export function candidateBrokerSymbols(requestedDisplaySymbol: string, knownSymbols: string[]): string[] {
  const aliases = displaySymbolAliases(requestedDisplaySymbol);
  const known = Array.from(new Set(knownSymbols.map((s) => s.trim()).filter(Boolean)));
  const knownUpper = new Map(known.map((s) => [s.toUpperCase(), s]));
  const patterns = detectSymbolPatterns(known);
  const attempted: string[] = [];

  function push(candidate: string) {
    const c = candidate.trim();
    if (!c) return;
    const real = knownUpper.get(c.toUpperCase()) ?? c;
    if (!attempted.includes(real)) attempted.push(real);
  }

  for (const alias of aliases) {
    push(alias);
    for (const suffix of patterns.suffixes) push(`${alias}${suffix}`);
    for (const prefix of patterns.prefixes) push(`${prefix}${alias}`);
    for (const suffix of COMMON_SUFFIXES) push(`${alias}${suffix}`);
    for (const prefix of COMMON_PREFIXES) push(`${prefix}${alias}`);
  }

  const aliasBases = new Set(aliases.map(baseOf));
  for (const symbol of known) {
    const symbolBase = baseOf(symbol);
    if (aliasBases.has(symbolBase)) push(symbol);
  }

  // Broker names with a decoration this list does not know (USOIL.spot, #EURUSD.v).
  // Only decorated forms: a plain "contains" also matched KO inside UKOUSD.
  for (const symbol of known) {
    if (aliases.some((alias) => isDecoratedForm(symbol, alias))) push(symbol);
  }

  return attempted.slice(0, 48);
}

export function resolveBrokerSymbol(
  requestedDisplaySymbol: string,
  knownSymbols: string[],
): SymbolResolutionResult {
  const request = requestedDisplaySymbol.trim().toUpperCase();
  const known = Array.from(new Set(knownSymbols.filter(Boolean)));
  const attempted: string[] = [];

  if (!request) {
    return {
      brokerSymbol: known[0] ?? "",
      displaySymbol: known[0] ?? "",
      exact: false,
      attempted,
      reason: "fallback_known",
    };
  }

  for (const candidate of candidateBrokerSymbols(request, known)) {
    if (!attempted.includes(candidate)) attempted.push(candidate);
  }
  if (!attempted.includes(request)) attempted.unshift(request);
  if (known.length === 0 || known.includes(request)) {
    return {
      brokerSymbol: request,
      displaySymbol: request,
      exact: true,
      attempted,
      reason: "exact_match",
    };
  }

  const requestBase = baseOf(request);
  for (const candidate of attempted) {
    // A candidate the account offers is used only when it is really this
    // instrument: a pattern suffix learned from BTCEUR.nx must not turn
    // BTCUSD into bitcoin-in-euros.
    if (known.includes(candidate) && brokerSymbolMatchesDisplay(request, candidate)) {
      return {
        brokerSymbol: candidate,
        displaySymbol: request,
        exact: candidate === request,
        attempted,
        reason: candidate === request ? "exact_match" : "suffix_variant",
      };
    }
  }

  for (const k of known) {
    if (baseOf(k) === requestBase && !attempted.includes(k)) attempted.push(k);
    if (baseOf(k) === requestBase) {
      return {
        brokerSymbol: k,
        displaySymbol: request,
        exact: false,
        attempted,
        reason: "suffix_variant",
      };
    }
  }

  return {
    brokerSymbol: request,
    displaySymbol: request,
    exact: false,
    attempted,
    reason: "fallback_request",
  };
}
