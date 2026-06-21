// ================================================================
// useMiniFeed — small secondary feed (MACRO or PRESS) via dataSource
// ================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { MINI_SIZE } from '../utils/constants';

/**
 * @param {{ dataSource: any, kind: 'general'|'press', enabled?: boolean }} params
 */
export function useMiniFeed({ dataSource, kind, enabled = true }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const abortRef              = useRef(null);

  const load = useCallback(async () => {
    if (!enabled || !dataSource) return;

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    try {
      const arr = await dataSource.fetchMiniFeed({ kind, limit: MINI_SIZE, signal: ctrl.signal });
      setItems(Array.isArray(arr) ? arr : []);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err);
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  }, [dataSource, kind, enabled]);

  useEffect(() => {
    load();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [load]);

  return { items, loading, error, refresh: load };
}
