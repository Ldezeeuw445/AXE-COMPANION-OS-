// ================================================================
// useDataCenterData — generic adapter-backed hook with AbortSignal
// and interval-based auto-refresh. Stale data is kept visible while
// a refresh is in flight; errors do not wipe prior data.
// ================================================================

import { useEffect, useRef, useState } from 'react';

export function useDataCenterData({ dataSource, refreshInterval = 60_000 }) {
  const [snapshot, setSnapshot] = useState(null); // { projects, fetchedAt } | null
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const tickRef = useRef(0);

  useEffect(() => {
    if (!dataSource || typeof dataSource.fetchProjects !== 'function') return undefined;

    const controller = new AbortController();
    let cancelled = false;
    let timer = null;

    const run = async () => {
      tickRef.current += 1;
      const myTick = tickRef.current;
      setLoading(true);
      try {
        const result = await dataSource.fetchProjects({ signal: controller.signal });
        if (cancelled || myTick !== tickRef.current) return;
        setSnapshot(result);
        setError(null);
      } catch (e) {
        if (cancelled || e?.name === 'AbortError') return;
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    if (refreshInterval > 0) {
      timer = setInterval(run, refreshInterval);
    }

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [dataSource, refreshInterval]);

  return { snapshot, loading, error };
}
