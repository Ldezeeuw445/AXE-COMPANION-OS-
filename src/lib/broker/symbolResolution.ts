/**
 * Account-aware broker symbol resolution.
 * Strategy: stay within the account's known symbol universe (positions + history + watchlist).
 * Try exact match first, then suffix variants of the requested base.
 */

const COMMON_SUFFIXES = [
  "",
  "m",
  "M",
  ".r",
  ".pro",
  ".raw",
  ".ecn",
  ".m",
  ".x",
  ".a",
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

const SYMBOL_ALIASES: Record<string, string[]> = {
  XAUUSD: ["XAUUSD", "GOLD"],
  BTCUSD: ["BTCUSD", "BTCUSDT", "BTC"],
  ETHUSD: ["ETHUSD", "ETHUSDT", "ETH"],
  EURUSD: ["EURUSD"],
  GBPUSD: ["GBPUSD"],
  USDJPY: ["USDJPY"],
  NASDAQ: ["NASDAQ", "NAS100", "US100", "USTEC", "NDX100", "NAS"],
  NAS100: ["NAS100", "US100", "NASDAQ", "USTEC", "NDX100", "NAS"],
  US100: ["US100", "NAS100", "NASDAQ", "USTEC", "NDX100", "NAS"],
  SPX: ["SPX", "SPX500", "US500", "SP500", "USA500", "S&P500"],
  SPX500: ["SPX500", "US500", "SP500", "USA500", "SPX", "S&P500"],
  US500: ["US500", "SPX500", "SP500", "USA500", "SPX", "S&P500"],
  US30: ["US30", "DJ30", "DOW", "DJI", "WS30", "US30USD"],
  DOW: ["DOW", "US30", "DJ30", "DJI", "WS30", "US30USD"],
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

export function displaySymbolAliases(symbol: string): string[] {
  const key = canonicalKey(symbol);
  const direct = SYMBOL_ALIASES[key] ?? [symbol.trim().toUpperCase()];
  return Array.from(new Set(direct.map((s) => s.trim().toUpperCase()).filter(Boolean)));
}

export function candidateBrokerSymbols(requestedDisplaySymbol: string, knownSymbols: string[]): string[] {
  const aliases = displaySymbolAliases(requestedDisplaySymbol);
  const known = Array.from(new Set(knownSymbols.map((s) => s.trim()).filter(Boolean)));
  const knownUpper = new Map(known.map((s) => [s.toUpperCase(), s]));
  const attempted: string[] = [];

  function push(candidate: string) {
    const c = candidate.trim();
    if (!c) return;
    const real = knownUpper.get(c.toUpperCase()) ?? c;
    if (!attempted.includes(real)) attempted.push(real);
  }

  for (const alias of aliases) {
    push(alias);
    for (const suffix of COMMON_SUFFIXES) push(`${alias}${suffix}`);
  }

  const aliasBases = new Set(aliases.map(baseOf));
  for (const symbol of known) {
    const symbolBase = baseOf(symbol);
    if (aliasBases.has(symbolBase)) push(symbol);
  }

  for (const symbol of known) {
    const symbolBase = baseOf(symbol);
    for (const alias of aliases) {
      const aliasBase = baseOf(alias);
      if (symbolBase.includes(aliasBase) || aliasBase.includes(symbolBase)) push(symbol);
    }
  }

  return attempted.slice(0, 24);
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
    if (known.includes(candidate)) {
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
