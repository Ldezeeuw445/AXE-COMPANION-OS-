// ================================================================
// NewsContext — shared state for the news module.
//
// Holds: dataSource (adapter), symbol, feed, filter, stream,
// request/error counters, and status. All FMP/Supabase concerns
// have been removed — your engine is the data source.
// ================================================================

import React, { createContext, useCallback, useRef, useState } from 'react';
import { STORAGE } from '../utils/constants';

/** @type {React.Context<import('../types.d.ts').NewsContextValue|null>} */
export const NewsContext = createContext(null);

function loadPref(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * NewsProvider — wraps NewsTab internals.
 * @param {{
 *   children: React.ReactNode,
 *   dataSource: import('../types.d.ts').DataSource,
 *   initialSymbol?: string|null,
 *   initialFeed?: import('../types.d.ts').FeedKey
 * }} props
 */
export function NewsProvider({ children, dataSource, initialSymbol = null, initialFeed }) {
  const [symbol, setSymbolState] = useState(initialSymbol);
  const [feed,   setFeedState]   = useState(() => initialFeed || loadPref(STORAGE.feed, 'stock'));
  const [filter, setFilterState] = useState(() => loadPref(STORAGE.filter, 'ALL'));
  const [stream, setStreamState] = useState(() => loadPref(STORAGE.stream, '1') === '1');
  const [status, setStatusState] = useState('idle');

  // Request/error counters — ref + state mirror avoids stale closures
  const reqRef = useRef(0);
  const errRef = useRef(0);
  const [reqCount, setReqCount] = useState(0);
  const [errCount, setErrCount] = useState(0);

  const setSymbol = useCallback((sym) => {
    setSymbolState(sym ? String(sym).toUpperCase() : null);
  }, []);

  const setFeed = useCallback((f) => {
    setFeedState(f);
    try { localStorage.setItem(STORAGE.feed, f); } catch { /* noop */ }
  }, []);

  const setFilter = useCallback((f) => {
    setFilterState(f);
    try { localStorage.setItem(STORAGE.filter, f); } catch { /* noop */ }
  }, []);

  const setStream = useCallback((s) => {
    setStreamState(s);
    try { localStorage.setItem(STORAGE.stream, s ? '1' : '0'); } catch { /* noop */ }
  }, []);

  const setStatus = useCallback((s) => setStatusState(s), []);

  const incReq = useCallback(() => {
    reqRef.current++;
    setReqCount(reqRef.current);
  }, []);

  const incErr = useCallback(() => {
    errRef.current++;
    setErrCount(errRef.current);
  }, []);

  const value = {
    dataSource,
    symbol, setSymbol,
    feed, setFeed,
    filter, setFilter,
    stream, setStream,
    status, setStatus,
    reqCount, errCount,
    incReq, incErr,
  };

  return (
    <NewsContext.Provider value={value}>
      {children}
    </NewsContext.Provider>
  );
}
