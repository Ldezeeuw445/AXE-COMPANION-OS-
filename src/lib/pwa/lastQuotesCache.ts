/**
 * Last watchlist quotes on this device. The service worker already keeps the
 * last GET; this snapshot lets the Markets screen reopen those numbers offline
 * and mark them stale instead of painting a live tick.
 */

const STORAGE_KEY = "axe.quotes.last";

export type CachedQuoteRow = {
  symbol: string;
  bid?: number | null;
  ask?: number | null;
  runtimePrice?: number | null;
  spread?: number | null;
  freshness?: string | null;
};

export type CachedQuotesSnapshot = {
  savedAt: number;
  rows: CachedQuoteRow[];
};

function storage(): Storage | null {
  try {
    const store = (globalThis as { localStorage?: Storage }).localStorage;
    if (!store) return null;
    return store;
  } catch {
    return null;
  }
}

export function readLastQuotes(): CachedQuotesSnapshot | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedQuotesSnapshot;
    if (!parsed || !Array.isArray(parsed.rows) || parsed.rows.length === 0) return null;
    if (!Number.isFinite(parsed.savedAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLastQuotes(rows: CachedQuoteRow[], savedAt = Date.now()): void {
  const store = storage();
  if (!store) return;
  const compact = rows
    .filter((row) => row.symbol)
    .map((row) => ({
      symbol: row.symbol,
      bid: row.bid ?? null,
      ask: row.ask ?? null,
      runtimePrice: row.runtimePrice ?? null,
      spread: row.spread ?? null,
      freshness: row.freshness ?? null,
    }));
  if (compact.length === 0) return;
  try {
    const snapshot: CachedQuotesSnapshot = { savedAt, rows: compact };
    store.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}

export function mergeLastQuotes<T extends CachedQuoteRow>(
  current: T[],
  snapshot: CachedQuotesSnapshot | null,
): T[] {
  if (!snapshot) return current;
  const bySymbol = new Map(snapshot.rows.map((row) => [row.symbol, row]));
  return current.map((item) => {
    const cached = bySymbol.get(item.symbol);
    if (!cached) return item;
    const hasLive = item.bid != null || item.ask != null || item.runtimePrice != null;
    if (hasLive) {
      return {
        ...item,
        freshness: item.freshness ?? cached.freshness ?? new Date(snapshot.savedAt).toISOString(),
      };
    }
    return {
      ...item,
      bid: cached.bid ?? item.bid,
      ask: cached.ask ?? item.ask,
      runtimePrice: cached.runtimePrice ?? item.runtimePrice,
      spread: cached.spread ?? item.spread,
      freshness: cached.freshness ?? new Date(snapshot.savedAt).toISOString(),
    };
  });
}
