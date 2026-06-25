// ================================================================
// useTicker — batch-quote polling for the watchlist ticker tape
// Uses dataSource.fetchTicker() — your engine decides how to batch.
// ================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { TICKER_INTERVAL } from '../utils/constants';

export function useTicker({ dataSource, symbols, enabled = true }) {
  const [quotes, setQuotes] = useState({});
  const [error, setError]   = useState(null);
  const abortRef            = useRef(null);

  const refresh = useCallback(async () => {
    if (!symbols.length || !enabled || !dataSource) return;

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const arr = await dataSource.fetchTicker({
        symbols: symbols.slice(0, 16),
        signal: ctrl.signal,
      });
      const map = {};
      for (const q of (arr || [])) if (q?.symbol) map[q.symbol] = q;
      setQuotes(map);
      setError(null);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err);
    }
  }, [dataSource, symbols, enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(refresh, TICKER_INTERVAL);
    return () => clearInterval(t);
  }, [refresh, enabled]);

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  return { quotes, refresh, error };
}
