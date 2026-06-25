// ================================================================
// useNewsFeed — feed items + pagination + streaming with diff detection
//
// Expects a DataSource adapter (from context) with fetchFeed().
// Your engine is responsible for filtering + normalization.
// ================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { PAGE_SIZE, STREAM_INTERVAL } from '../utils/constants';

export function useNewsFeed({ dataSource, feed, symbol, stream, enabled = true, onError }) {
  const [items, setItems]             = useState([]);
  const [page, setPage]               = useState(0);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [lastUpdate, setLastUpdate]   = useState(null);
  const [pendingNew, setPendingNew]   = useState(0);
  const [nextPollAt, setNextPollAt]   = useState(0);

  const knownIdsRef    = useRef(new Set());
  const loadingRef     = useRef(false);
  const streamTimerRef = useRef(null);
  const flashTimersRef = useRef([]);
  const abortRef       = useRef(null);

  const safeFetch = useCallback(async (pageIdx, signal) => {
    const res = await dataSource.fetchFeed({
      feed,
      symbol: symbol || null,
      page: pageIdx,
      limit: PAGE_SIZE,
      signal,
    });
    return Array.isArray(res) ? res : [];
  }, [dataSource, feed, symbol]);

  const loadNews = useCallback(async ({ append = false } = {}) => {
    if (loadingRef.current || !enabled || !dataSource) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const targetPage = append ? page + 1 : 0;

    try {
      const arr = await safeFetch(targetPage, ctrl.signal);

      if (append) {
        setItems((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const fresh = arr.filter((n) => n && n.id && !seen.has(n.id));
          fresh.forEach((n) => knownIdsRef.current.add(n.id));
          return prev.concat(fresh);
        });
        setPage(targetPage);
      } else {
        knownIdsRef.current = new Set(arr.map((n) => n.id));
        setItems(arr);
        setPage(0);
        setPendingNew(0);
      }

      setLastUpdate(Date.now());
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err);
        onError?.(err);
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [safeFetch, page, enabled, dataSource, onError]);

  const refresh  = useCallback(() => loadNews({ append: false }), [loadNews]);
  const loadMore = useCallback(() => loadNews({ append: true }),  [loadNews]);

  // Reload when feed or symbol changes
  useEffect(() => {
    if (!enabled) return;
    loadNews({ append: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, symbol, enabled]);

  // Streaming tick — diff, prepend, flash
  const streamTick = useCallback(async () => {
    if (!enabled || !dataSource) return;
    try {
      const arr = await safeFetch(0);
      const fresh = arr.filter((n) => n && n.id && !knownIdsRef.current.has(n.id));
      if (fresh.length) {
        fresh.forEach((n) => {
          n._isNew = true;
          knownIdsRef.current.add(n.id);
        });
        setItems((prev) => fresh.concat(prev));
        setPendingNew((n) => n + fresh.length);

        const t = setTimeout(() => {
          setItems((prev) => prev.map((it) => (it._isNew ? { ...it, _isNew: false } : it)));
        }, 2000);
        flashTimersRef.current.push(t);
      }
      setLastUpdate(Date.now());
    } catch (err) {
      // Stay silent on stream errors
      if (err?.name !== 'AbortError') {
        // eslint-disable-next-line no-console
        console.warn('[useNewsFeed stream]', err?.message || err);
      }
    }
  }, [safeFetch, enabled, dataSource]);

  useEffect(() => {
    if (!stream || !enabled) {
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
      setNextPollAt(0);
      return;
    }
    setNextPollAt(Date.now() + STREAM_INTERVAL);
    streamTimerRef.current = setInterval(() => {
      setNextPollAt(Date.now() + STREAM_INTERVAL);
      streamTick();
    }, STREAM_INTERVAL);
    return () => {
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    };
  }, [stream, enabled, streamTick]);

  useEffect(() => () => {
    flashTimersRef.current.forEach(clearTimeout);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  const clearPendingNew = useCallback(() => setPendingNew(0), []);

  return {
    items,
    loading,
    error,
    lastUpdate,
    pendingNew,
    nextPollAt,
    page,
    refresh,
    loadNews,
    loadMore,
    clearPendingNew,
  };
}
