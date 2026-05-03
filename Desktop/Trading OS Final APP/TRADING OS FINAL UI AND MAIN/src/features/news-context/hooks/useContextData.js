// ================================================================
// useContextData — generic hook that wraps a ContextDataSource method
// Handles: loading, error, auto-refresh, AbortSignal cancellation.
// ================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * @param {{
 *   dataSource: object,
 *   methodName: 'fetchAnalystConsensus'|'fetchRelativePerformance'|'fetchKeyLevels'|'fetchSentimentShort',
 *   symbol: string|null,
 *   refreshInterval?: number
 * }} params
 */
export function useContextData({ dataSource, methodName, symbol, refreshInterval = 60_000 }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [lastUpdate, setLast] = useState(null);
  const abortRef              = useRef(null);

  const load = useCallback(async () => {
    if (!symbol || !dataSource || typeof dataSource[methodName] !== 'function') {
      setData(null);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    try {
      const res = await dataSource[methodName]({ symbol, signal: ctrl.signal });
      setData(res || null);
      setLast(Date.now());
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setError(err);
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [dataSource, methodName, symbol]);

  // Reload on symbol change
  useEffect(() => {
    load();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [load]);

  // Auto-refresh
  useEffect(() => {
    if (!refreshInterval || !symbol) return;
    const t = setInterval(load, refreshInterval);
    return () => clearInterval(t);
  }, [load, refreshInterval, symbol]);

  return { data, loading, error, lastUpdate, reload: load };
}
