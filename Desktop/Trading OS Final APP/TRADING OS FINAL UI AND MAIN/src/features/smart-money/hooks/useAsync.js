import { useEffect, useRef, useState, useCallback } from "react";

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const latest = useRef(0);

  const run = useCallback(() => {
    const id = ++latest.current;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve(fn(controller.signal))
      .then((data) => {
        if (id === latest.current) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (id === latest.current && err && err.name !== "AbortError") {
          setState({ data: null, loading: false, error: err });
        }
      });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => run(), [run]);

  return { ...state, refetch: run };
}

export function usePolling(fn, intervalMs, deps = []) {
  const { data, loading, error, refetch } = useAsync(fn, deps);
  useEffect(() => {
    if (!intervalMs) return undefined;
    const id = setInterval(() => refetch(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, refetch]);
  return { data, loading, error, refetch };
}
