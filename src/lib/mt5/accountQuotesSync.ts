/**
 * Per-account Quotes = AXE watchlist mapped through the broker symbol registry.
 *
 * The AXE watchlist is canonical and never changes when switching accounts.
 * Each MT5 cloud account has a symbol registry (metadata.symbol_map +
 * symbol_universe from MetaApi GET /symbols). Quotes shows the watchlist in
 * the same order, resolved to that account's real broker names (suffixes like
 * .x / .pro / m, aliases like GOLD→XAUUSD). Symbols the account does not offer
 * are omitted.
 */

import {
  cleanDisplaySymbol,
  resolveBrokerSymbol,
} from "@/lib/broker/symbolResolution";

export const MT5_QUOTES_SOURCE = "watchlist_symbol_registry" as const;

export type Mt5QuotesSyncMeta = {
  mt5_quotes_symbols: string[];
  mt5_quotes_unavailable: string[];
  mt5_quotes_synced_at: string;
  mt5_quotes_source: typeof MT5_QUOTES_SOURCE;
  mt5_quotes_note: string;
};

export const MT5_QUOTES_LIMITATION_NOTE =
  "Quotes follow your AXE watchlist, mapped to this account's broker symbol names via the symbol registry (MetaApi symbol universe). Symbols this broker does not offer are omitted.";

export type MappedWatchlistQuote = {
  /** Canonical AXE watchlist symbol (e.g. XAUUSD). */
  canonical: string;
  /** Broker-facing symbol for the active account (e.g. XAUUSD.x). */
  broker: string;
};

export type WatchlistQuotesMapping = {
  available: MappedWatchlistQuote[];
  unavailable: string[];
};

function pushUniqueCanonical(out: string[], seen: Set<string>, raw: string): void {
  const cleaned = cleanDisplaySymbol(raw) || raw.trim().toUpperCase();
  if (!cleaned) return;
  const key = cleaned.toUpperCase();
  if (seen.has(key)) return;
  seen.add(key);
  out.push(cleaned);
}

/** Normalize a watchlist to unique canonical symbols, preserving first-seen order. */
export function normalizeWatchlistSymbols(watchlist: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of watchlist) {
    if (typeof raw !== "string") continue;
    pushUniqueCanonical(out, seen, raw);
  }
  return out;
}

function lookupSymbolMap(
  symbolMap: Record<string, string>,
  canonical: string,
): string | undefined {
  const direct = symbolMap[canonical] ?? symbolMap[canonical.toUpperCase()];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  // Case-insensitive fallback
  const upper = canonical.toUpperCase();
  for (const [k, v] of Object.entries(symbolMap)) {
    if (k.toUpperCase() === upper && typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Map the canonical AXE watchlist onto an account's broker symbol registry.
 * Prefer exact symbol_map hit, then resolveBrokerSymbol against the universe
 * (exact → suffix variants → aliases). Deterministic; preserves watchlist order.
 */
export function mapWatchlistToAccountQuotes(
  watchlist: string[],
  symbolMap: Record<string, string>,
  universe: string[] = [],
): WatchlistQuotesMapping {
  const canonicals = normalizeWatchlistSymbols(watchlist);
  const available: MappedWatchlistQuote[] = [];
  const unavailable: string[] = [];
  const universeUpper = new Set(universe.map((s) => s.trim().toUpperCase()).filter(Boolean));
  const hasUniverse = universeUpper.size > 0;

  for (const canonical of canonicals) {
    const mapped = lookupSymbolMap(symbolMap, canonical);
    if (mapped) {
      if (!hasUniverse || universeUpper.has(mapped.toUpperCase())) {
        available.push({ canonical, broker: mapped });
        continue;
      }
      // Stale map entry not in current universe — try fresh resolve.
    }

    if (!hasUniverse) {
      // No universe yet (still warming): keep row with map/fallback so Quotes
      // can show "Resolving" rather than silently dropping the whole list.
      if (mapped) {
        available.push({ canonical, broker: mapped });
      } else {
        unavailable.push(canonical);
      }
      continue;
    }

    const resolution = resolveBrokerSymbol(canonical, universe);
    const broker = resolution.brokerSymbol?.trim() ?? "";
    const ok =
      Boolean(broker) &&
      resolution.reason !== "fallback_request" &&
      universeUpper.has(broker.toUpperCase());

    if (ok) {
      // Prefer the casing from the universe list when available.
      const universeHit =
        universe.find((s) => s.trim().toUpperCase() === broker.toUpperCase()) ?? broker;
      available.push({ canonical, broker: universeHit });
    } else {
      unavailable.push(canonical);
    }
  }

  return { available, unavailable };
}

export function buildMt5QuotesSyncMeta(
  mapping: WatchlistQuotesMapping,
  syncedAt: string = new Date().toISOString(),
): Mt5QuotesSyncMeta {
  return {
    mt5_quotes_symbols: mapping.available.map((row) => row.broker),
    mt5_quotes_unavailable: mapping.unavailable,
    mt5_quotes_synced_at: syncedAt,
    mt5_quotes_source: MT5_QUOTES_SOURCE,
    mt5_quotes_note: MT5_QUOTES_LIMITATION_NOTE,
  };
}

export function getMetadataMt5QuotesSymbols(
  meta: Record<string, unknown> | null | undefined,
): string[] {
  const raw = meta?.mt5_quotes_symbols;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const symbol = item.trim();
    if (!symbol) continue;
    const key = symbol.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(symbol);
  }
  return out;
}

export function getMetadataMt5QuotesUnavailable(
  meta: Record<string, unknown> | null | undefined,
): string[] {
  const raw = meta?.mt5_quotes_unavailable;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    pushUniqueCanonical(out, seen, item);
  }
  return out;
}

/**
 * Ensure symbol_map can resolve both clean display (XAUUSD) and broker name
 * (XAUUSD.x) to the broker symbol used for prices/orders.
 */
export function mergeMappedQuotesIntoSymbolMap(
  existing: Record<string, string>,
  mapping: WatchlistQuotesMapping,
): Record<string, string> {
  const next = { ...existing };
  for (const row of mapping.available) {
    const broker = row.broker.trim();
    const canonical = row.canonical.trim().toUpperCase();
    if (!broker || !canonical) continue;
    next[canonical] = broker;
    next[broker.toUpperCase()] = broker;
  }
  return next;
}
