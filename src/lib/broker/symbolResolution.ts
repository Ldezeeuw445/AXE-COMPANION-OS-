/**
 * Account-aware broker symbol resolution.
 * Strategy: stay within the account's known symbol universe (positions + history + watchlist).
 * Try exact match first, then suffix variants of the requested base.
 */

const COMMON_SUFFIXES = ["", "m", "M", ".r", ".pro", ".raw", ".ecn", "c", "i", "_i", "_ecn", "+", "-", "z", "p"];

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

  attempted.push(request);
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
  for (const suffix of COMMON_SUFFIXES) {
    const candidate = `${request}${suffix}`;
    if (suffix && !attempted.includes(candidate)) attempted.push(candidate);
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
