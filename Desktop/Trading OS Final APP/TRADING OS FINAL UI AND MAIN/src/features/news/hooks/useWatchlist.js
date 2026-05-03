// ================================================================
// useWatchlist — localStorage-backed watchlist with add/remove
// Accepts optional initialList to seed on first mount.
// ================================================================

import { useCallback, useEffect, useState } from 'react';
import { STORAGE, DEFAULT_WATCHLIST } from '../utils/constants';

const load = (fallback) => {
  try {
    const raw = localStorage.getItem(STORAGE.watchlist);
    if (raw) return JSON.parse(raw);
    return fallback || DEFAULT_WATCHLIST;
  } catch {
    return fallback || DEFAULT_WATCHLIST;
  }
};

export function useWatchlist(initialList) {
  const [watchlist, setWatchlist] = useState(() => load(initialList));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE.watchlist, JSON.stringify(watchlist));
    } catch { /* noop */ }
  }, [watchlist]);

  const addSymbol = useCallback((sym) => {
    if (!sym) return false;
    const s = String(sym).toUpperCase();
    let added = false;
    setWatchlist((prev) => {
      if (prev.includes(s)) return prev;
      added = true;
      return [s, ...prev];
    });
    return added;
  }, []);

  const removeSymbol = useCallback((sym) => {
    setWatchlist((prev) => prev.filter((x) => x !== sym));
  }, []);

  const has = useCallback((sym) => watchlist.includes(sym), [watchlist]);

  return {
    watchlist,
    addSymbol,
    removeSymbol,
    has,
    // aliases for convenience
    add: addSymbol,
    remove: removeSymbol,
  };
}
