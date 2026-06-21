/** Canonical watchlist shape: category → symbols (pairs / instruments). */
export type WatchlistGroups = Record<string, string[]>;

/** Display order in sidebar / settings. */
export const WATCHLIST_CATEGORY_ORDER = [
  'BONDS',
  'CRYPTO',
  'ENERGY',
  'FX',
  'INDICES',
  'METALS',
] as const;

export const DEFAULT_WATCHLIST_GROUPS: WatchlistGroups = {
  BONDS: ['US 2-Year', 'US 10-Year', 'US 30-Year', 'DE 10-Year', 'JP 10-Year'],
  CRYPTO: ['BTC/USD', 'ETH/USD', 'XRP/USD', 'SOL/USD'],
  ENERGY: ['WTI Crude', 'Brent Crude', 'Natural Gas', 'Gasoline'],
  FX: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD'],
  INDICES: ['Nasdaq 100', 'S&P 500', 'Dow Jones', 'DAX 40', 'FTSE 100', 'Nikkei 225'],
  METALS: ['XAUUSD', 'XAGUSD', 'XPTUSD', 'Copper'],
};

export const WATCHLIST_GROUPS_STORAGE_KEY = 'tradingos.watchlist.groups.v1';

export function cloneDefaultGroups(): WatchlistGroups {
  const out: WatchlistGroups = {};
  for (const k of WATCHLIST_CATEGORY_ORDER) {
    out[k] = [...(DEFAULT_WATCHLIST_GROUPS[k] || [])];
  }
  return out;
}

/** Ensure all known categories exist; keep user lists as-is (including empty). */
export function normalizeWatchlistGroups(input: WatchlistGroups | null | undefined): WatchlistGroups {
  const out: WatchlistGroups = {} as WatchlistGroups;
  for (const cat of WATCHLIST_CATEGORY_ORDER) {
    const arr = input?.[cat];
    out[cat] = Array.isArray(arr) ? arr.map(String).map((s) => s.trim()).filter(Boolean) : [];
  }
  return out;
}

export function flattenWatchlistGroups(groups: WatchlistGroups): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const cat of WATCHLIST_CATEGORY_ORDER) {
    for (const s of groups[cat] || []) {
      const t = String(s).trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

export function loadWatchlistGroupsFromStorage(): WatchlistGroups | null {
  try {
    const raw = localStorage.getItem(WATCHLIST_GROUPS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as WatchlistGroups;
  } catch {
    return null;
  }
}

export function saveWatchlistGroupsToStorage(groups: WatchlistGroups) {
  try {
    localStorage.setItem(WATCHLIST_GROUPS_STORAGE_KEY, JSON.stringify(groups));
  } catch {
    /* noop */
  }
}
