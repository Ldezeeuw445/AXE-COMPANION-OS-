// ================================================================
// useSymbolSearch — debounced autocomplete via dataSource.searchSymbols
// ================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export function useSymbolSearch({ dataSource, query, enabled = true, delay = 220, limit = 8 }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timerRef              = useRef(null);
  const abortRef              = useRef(null);

  const runSearch = useCallback(async (q) => {
    if (!q || !dataSource) {
      setResults([]);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    try {
      const arr = await dataSource.searchSymbols({ query: q, limit, signal: ctrl.signal });
      // Dedup by symbol
      const map = new Map();
      (arr || []).forEach((it) => {
        if (it && it.symbol && !map.has(it.symbol)) map.set(it.symbol, it);
      });
      setResults([...map.values()].slice(0, limit));
    } catch (err) {
      if (err.name !== 'AbortError') setResults([]);
    } finally {
      setLoading(false);
    }
  }, [dataSource, limit]);

  useEffect(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query) {
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(() => runSearch(query), delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, enabled, delay, runSearch]);

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  const clear = useCallback(() => setResults([]), []);

  return { results, loading, clear };
}
