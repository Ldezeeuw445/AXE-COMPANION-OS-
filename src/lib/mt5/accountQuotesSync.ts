/**
 * Closest honest MT5 → AXE Quotes sync.
 *
 * MetaApi does NOT expose the desktop Market Watch list or its order
 * (GET /symbols = broker universe; subscribeToMarketData = MetaApi's own
 * cloud subscriptions). We derive a per-account quotes list from live
 * activity: open positions → pending orders → recent deal symbols, keeping
 * broker suffixes (e.g. XAUUSD.x) so prices match the terminal.
 */

export const MT5_QUOTES_SOURCE = "activity_positions_orders_deals" as const;

export type Mt5QuotesSyncMeta = {
  mt5_quotes_symbols: string[];
  mt5_quotes_synced_at: string;
  mt5_quotes_source: typeof MT5_QUOTES_SOURCE;
  /** Honest limitation note stored for UI/debug. */
  mt5_quotes_note: string;
};

export const MT5_QUOTES_LIMITATION_NOTE =
  "MetaApi cannot read the desktop Market Watch list or order. Quotes are synced from open positions, pending orders, and recent deal history with broker symbol names (incl. suffixes like .x).";

function extractSymbol(row: unknown): string {
  if (!row || typeof row !== "object" || Array.isArray(row)) return "";
  const sym = (row as Record<string, unknown>).symbol;
  return typeof sym === "string" ? sym.trim() : "";
}

/** Stable unique push preserving first-seen order. */
function pushUnique(out: string[], seen: Set<string>, raw: string): void {
  const symbol = raw.trim();
  if (!symbol) return;
  const key = symbol.toUpperCase();
  if (seen.has(key)) return;
  seen.add(key);
  out.push(symbol);
}

/**
 * Derive broker symbols for the Quotes list from MT5 activity.
 * Order: positions (as returned) → pending orders → deals (most recent first when timed).
 */
export function deriveMt5ActivityQuotesSymbols(input: {
  positions?: unknown[] | null;
  orders?: unknown[] | null;
  deals?: unknown[] | null;
  /** Optional hard cap (default 40). */
  max?: number;
}): string[] {
  const max = Math.max(1, input.max ?? 40);
  const out: string[] = [];
  const seen = new Set<string>();

  for (const row of input.positions ?? []) {
    pushUnique(out, seen, extractSymbol(row));
    if (out.length >= max) return out;
  }
  for (const row of input.orders ?? []) {
    pushUnique(out, seen, extractSymbol(row));
    if (out.length >= max) return out;
  }

  const deals = [...(input.deals ?? [])];
  deals.sort((a, b) => {
    const ta = dealTimeMs(a);
    const tb = dealTimeMs(b);
    return tb - ta;
  });
  for (const row of deals) {
    pushUnique(out, seen, extractSymbol(row));
    if (out.length >= max) return out;
  }

  return out;
}

function dealTimeMs(row: unknown): number {
  if (!row || typeof row !== "object") return 0;
  const r = row as Record<string, unknown>;
  const candidates = [r.time, r.brokerTime, r.closeTime, r.openTime];
  for (const c of candidates) {
    if (typeof c === "string" || typeof c === "number") {
      const ms = new Date(c).getTime();
      if (Number.isFinite(ms)) return ms;
    }
  }
  return 0;
}

export function buildMt5QuotesSyncMeta(
  symbols: string[],
  syncedAt: string = new Date().toISOString(),
): Mt5QuotesSyncMeta {
  return {
    mt5_quotes_symbols: symbols.map((s) => s.trim()).filter(Boolean),
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
    pushUnique(out, seen, item);
  }
  return out;
}

/**
 * Ensure symbol_map can resolve both clean display (XAUUSD) and broker name
 * (XAUUSD.x) to the broker symbol, so Quotes prices match MT5.
 */
export function mergeBrokerSymbolsIntoSymbolMap(
  existing: Record<string, string>,
  brokerSymbols: string[],
  cleanDisplay: (symbol: string) => string,
): Record<string, string> {
  const next = { ...existing };
  for (const broker of brokerSymbols) {
    const b = broker.trim();
    if (!b) continue;
    const upper = b.toUpperCase();
    next[upper] = b;
    const display = cleanDisplay(b) || upper;
    if (display && !next[display]) next[display] = b;
    // Prefer exact broker for the cleaned display when we know it from activity.
    if (display) next[display] = b;
  }
  return next;
}
