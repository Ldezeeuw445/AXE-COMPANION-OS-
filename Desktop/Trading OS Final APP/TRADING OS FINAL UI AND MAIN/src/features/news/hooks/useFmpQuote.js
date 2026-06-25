// ================================================================
// useQuote — single-symbol quote loader.
// Filename kept for backward-compat; now generic (no FMP in it).
// ================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export function useQuote({ dataSource, symbol, enabled = true }) {
  const [quote, setQuote]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const abortRef              = useRef(null);

  const load = useCallback(async (sym) => {
    if (!sym || !enabled || !dataSource) {
      setQuote(null);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    try {
      const q = await dataSource.fetchQuote({ symbol: sym, signal: ctrl.signal });
      if (!q || !q.symbol) throw new Error('No quote found for ' + sym);
      setQuote(q);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err);
        setQuote(null);
      }
    } finally {
      setLoading(false);
    }
  }, [dataSource, enabled]);

  useEffect(() => {
    load(symbol);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [symbol, load]);

  return { quote, loading, error, reload: () => load(symbol) };
}

// Backward-compat alias
export { useQuote as useFmpQuote };
