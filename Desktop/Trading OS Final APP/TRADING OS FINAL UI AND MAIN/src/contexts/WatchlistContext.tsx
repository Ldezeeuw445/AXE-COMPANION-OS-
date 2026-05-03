import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  cloneDefaultGroups,
  flattenWatchlistGroups,
  loadWatchlistGroupsFromStorage,
  normalizeWatchlistGroups,
  saveWatchlistGroupsToStorage,
  type WatchlistGroups,
  WATCHLIST_CATEGORY_ORDER,
} from '@/lib/watchlistDefaults';

export type WatchlistContextValue = {
  groups: WatchlistGroups;
  /** Unique symbols in category order (for ticker tape / top bar). */
  flatSymbols: string[];
  setGroups: (next: WatchlistGroups) => void;
  resetToDefaults: () => void;
  addSymbolToCategory: (category: string, symbol: string) => boolean;
  removeSymbol: (symbol: string) => void;
  moveSymbolToCategory: (symbol: string, targetCategory: string) => void;
};

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

function normalizeSymbol(raw: string) {
  return String(raw || '').trim();
}

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [groups, setGroupsState] = useState<WatchlistGroups>(() => {
    const stored = loadWatchlistGroupsFromStorage();
    if (stored) return normalizeWatchlistGroups(stored);
    return cloneDefaultGroups();
  });

  useEffect(() => {
    saveWatchlistGroupsToStorage(groups);
  }, [groups]);

  const flatSymbols = useMemo(() => flattenWatchlistGroups(groups), [groups]);

  const setGroups = useCallback((next: WatchlistGroups) => {
    setGroupsState(normalizeWatchlistGroups(next));
  }, []);

  const resetToDefaults = useCallback(() => {
    setGroupsState(cloneDefaultGroups());
  }, []);

  const addSymbolToCategory = useCallback((category: string, raw: string) => {
    const sym = normalizeSymbol(raw);
    if (!sym) return false;
    const cat = WATCHLIST_CATEGORY_ORDER.includes(category as (typeof WATCHLIST_CATEGORY_ORDER)[number])
      ? category
      : 'FX';
    const result = { changed: false };
    setGroupsState((prev) => {
      const next = normalizeWatchlistGroups(prev);
      const currentCat = WATCHLIST_CATEGORY_ORDER.find((c) => (next[c] || []).includes(sym));
      if (currentCat === cat) {
        return prev;
      }
      for (const c of WATCHLIST_CATEGORY_ORDER) {
        next[c] = [...(next[c] || [])].filter((x) => x !== sym);
      }
      next[cat] = [...(next[cat] || []), sym];
      result.changed = true;
      return next;
    });
    return result.changed;
  }, []);

  const removeSymbol = useCallback((raw: string) => {
    const sym = normalizeSymbol(raw);
    if (!sym) return;
    setGroupsState((prev) => {
      const next = normalizeWatchlistGroups(prev);
      for (const c of WATCHLIST_CATEGORY_ORDER) {
        next[c] = [...(next[c] || [])].filter((x) => x !== sym);
      }
      return next;
    });
  }, []);

  const moveSymbolToCategory = useCallback((raw: string, targetCategory: string) => {
    const sym = normalizeSymbol(raw);
    if (!sym) return;
    const cat = WATCHLIST_CATEGORY_ORDER.includes(targetCategory as (typeof WATCHLIST_CATEGORY_ORDER)[number])
      ? targetCategory
      : 'FX';
    setGroupsState((prev) => {
      const next = normalizeWatchlistGroups(prev);
      for (const c of WATCHLIST_CATEGORY_ORDER) {
        next[c] = [...(next[c] || [])].filter((x) => x !== sym);
      }
      const list = [...(next[cat] || [])];
      if (!list.includes(sym)) list.push(sym);
      next[cat] = list;
      return next;
    });
  }, []);

  const value = useMemo<WatchlistContextValue>(
    () => ({
      groups,
      flatSymbols,
      setGroups,
      resetToDefaults,
      addSymbolToCategory,
      removeSymbol,
      moveSymbolToCategory,
    }),
    [groups, flatSymbols, setGroups, resetToDefaults, addSymbolToCategory, removeSymbol, moveSymbolToCategory],
  );

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useTerminalWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) {
    throw new Error('useTerminalWatchlist must be used within WatchlistProvider');
  }
  return ctx;
}

export function useTerminalWatchlistOptional(): WatchlistContextValue | null {
  return useContext(WatchlistContext);
}
