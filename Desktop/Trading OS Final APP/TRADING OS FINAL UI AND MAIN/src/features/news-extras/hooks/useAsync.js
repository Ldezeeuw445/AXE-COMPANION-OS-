// ================================================================
// useAsync — generic data-fetching hook with AbortSignal and
// optional refresh interval. Keeps stale data visible during
// background refreshes.
// ================================================================

import { useEffect, useRef, useState, useCallback } from 'react';

export function useAsync({ fetcher, deps = [], refreshInterval = 0 }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const tick = useRef(0);

  const run = useCallback(() => {
    if (!fetcher) return () => {};
    const controller = new AbortController();
    let cancelled = false;
    tick.current += 1;
    const id = tick.current;
    setLoading(true);
    Promise.resolve(fetcher({ signal: controller.signal }))
      .then((res) => {
        if (cancelled || id !== tick.current) return;
        setData(res);
        setError(null);
      })
      .catch((e) => {
        if (cancelled || e?.name === 'AbortError') return;
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const cleanup = run();
    let timer = null;
    if (refreshInterval > 0) {
      timer = setInterval(() => run(), refreshInterval);
    }
    return () => {
      if (cleanup) cleanup();
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, refreshInterval]);

  return { data, loading, error, refetch: run };
}
