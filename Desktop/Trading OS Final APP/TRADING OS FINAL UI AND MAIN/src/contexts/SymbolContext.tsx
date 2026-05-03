/**
 * SymbolContext — Global Pair Filter
 *
 * Provides: { symbol, setSymbol, recentSymbols, categoryFilter }
 * Default: XAU/USD (chart + watchlist canonical for gold)
 * All tabs import useSymbol() and filter content
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { getAppMode } from '@/lib/appMode';

/** AXE uses its own keys so the terminal’s saved pair (e.g. ES) does not leak into Companion. */
function symbolStorageKeys(): { active: string; recent: string } {
  return getAppMode() === 'axe'
    ? { active: 'axe.activeSymbol', recent: 'axe.recentSymbols' }
    : { active: 'tradingos.activeSymbol', recent: 'tradingos.recentSymbols' };
}

function loadStoredSymbol(): string {
  try {
    const { active } = symbolStorageKeys();
    const s = localStorage.getItem(active);
    if (s && s.trim()) return s.trim();
  } catch { /* noop */ }
  return 'XAU/USD';
}

function loadStoredRecents(fallback: string[]): string[] {
  try {
    const { recent } = symbolStorageKeys();
    const raw = localStorage.getItem(recent);
    if (raw) {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr) && arr.length) return arr.map(String).filter(Boolean).slice(0, 10);
    }
  } catch { /* noop */ }
  return fallback;
}

export interface SymbolContextValue {
  symbol: string;
  setSymbol: (s: string) => void;
  recentSymbols: string[];
  /** Apply symbol + recents from server without re-deriving recents (cloud sync). */
  hydrateFromWorkspaceServer: (sym: string, recents: string[]) => void;
  categoryFilter: string | null;
  setCategoryFilter: (c: string | null) => void;
}

const SymbolContext = createContext<SymbolContextValue>({
  symbol: 'XAU/USD',
  setSymbol: () => {},
  recentSymbols: ['XAU/USD', 'EUR/USD', 'GBP/USD', 'BTC/USD', 'US30'],
  hydrateFromWorkspaceServer: () => {},
  categoryFilter: null,
  setCategoryFilter: () => {},
});

export function SymbolProvider({ children }: { children: ReactNode }) {
  const defaultRecents = ['XAU/USD', 'EUR/USD', 'GBP/USD', 'BTC/USD', 'US30'];
  const [symbol, setSymbolRaw] = useState(loadStoredSymbol);
  const [recentSymbols, setRecentSymbols] = useState<string[]>(() =>
    loadStoredRecents(defaultRecents),
  );
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const setSymbol = useCallback((s: string) => {
    setSymbolRaw(s);
    try {
      localStorage.setItem(symbolStorageKeys().active, s);
    } catch { /* noop */ }
    setRecentSymbols(prev => {
      const filtered = prev.filter(x => x !== s);
      const next = [s, ...filtered].slice(0, 10);
      try {
        localStorage.setItem(symbolStorageKeys().recent, JSON.stringify(next));
      } catch { /* noop */ }
      return next;
    });
  }, []);

  const hydrateFromWorkspaceServer = useCallback((sym: string, recents: string[]) => {
    const s = String(sym || '').trim() || 'XAU/USD';
    const r = Array.isArray(recents) && recents.length
      ? recents.map(String).filter(Boolean).slice(0, 10)
      : loadStoredRecents(defaultRecents);
    setSymbolRaw(s);
    setRecentSymbols(r);
    try {
      const k = symbolStorageKeys();
      localStorage.setItem(k.active, s);
      localStorage.setItem(k.recent, JSON.stringify(r));
    } catch { /* noop */ }
  }, []);

  return (
    <SymbolContext.Provider
      value={{
        symbol,
        setSymbol,
        recentSymbols,
        hydrateFromWorkspaceServer,
        categoryFilter,
        setCategoryFilter,
      }}
    >
      {children}
    </SymbolContext.Provider>
  );
}

export function useSymbol() {
  return useContext(SymbolContext);
}
