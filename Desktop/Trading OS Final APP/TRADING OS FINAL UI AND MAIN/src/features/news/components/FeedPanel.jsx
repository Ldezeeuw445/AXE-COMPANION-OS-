// ================================================================
// FeedPanel — center feed with header, row list, footer
// Filter is applied against item.tags[] (array from your engine).
// ================================================================

import React, { useContext, useCallback, useRef, useEffect } from 'react';
import { NewsContext } from '../context/NewsContext.jsx';
import { FeedRow } from './FeedRow.jsx';
import { hhmm } from '../utils/format.js';
import s from '../styles/news.module.css';

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className={`${s.skel} ${s['skel-row']}`} />
      ))}
    </>
  );
}

function feedTitle(feed, symbol) {
  switch (feed) {
    case 'stock':    return symbol ? `STOCK NEWS · ${symbol}` : 'STOCK NEWS · LATEST';
    case 'general':  return 'MACRO · LATEST';
    case 'press':    return symbol ? `PRESS · ${symbol}` : 'PRESS RELEASES · LATEST';
    case 'articles': return 'ARTICLES';
    default:         return '';
  }
}

function filterItems(items, filter) {
  if (filter === 'ALL') return items;
  return items.filter((it) => Array.isArray(it.tags) && it.tags.includes(filter));
}

export function FeedPanel({
  items,
  loading,
  error,
  pendingNew,
  lastUpdate,
  onLoadMore,
  onClearPendingNew,
  onSelectSymbol,
  selectedIndex,
  setSelectedIndex,
  onRefresh,
}) {
  const { feed, symbol, filter } = useContext(NewsContext);
  const listRef = useRef(null);

  useEffect(() => {
    if (selectedIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleSelect = useCallback((index) => setSelectedIndex(index), [setSelectedIndex]);
  const handleOpen   = useCallback((url) => { if (url) window.open(url, '_blank', 'noopener'); }, []);
  const handleBadge  = useCallback(() => {
    onClearPendingNew();
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [onClearPendingNew]);

  const filtered = filterItems(items, filter);
  const title = feedTitle(feed, symbol);

  return (
    <section className={`${s.feed} ${s['elevation-2']}`}>
      {/* Header */}
      <div className={s.feed__head}>
        <div className={s.feed__headL}>
          <h2 className={s.mono}>{title}</h2>
          {pendingNew > 0 && (
            <span
              className={s.newbadge}
              onClick={handleBadge}
              style={{ cursor: 'pointer' }}
            >
              {pendingNew} NEW
            </span>
          )}
        </div>
        <div className={s.feed__headR}>
          <span className={`${s.mono} ${s.muted}`}>
            {lastUpdate ? `Updated ${hhmm(lastUpdate)}` : '—'}
          </span>
          <button className={s.iconbtn} title="Refresh (r)" onClick={onRefresh} type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
              <path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Row list */}
      <div ref={listRef} className={s.rowlist} tabIndex={0} aria-live="polite">
        {loading && !items.length ? (
          <SkeletonRows />
        ) : error ? (
          <div className={s.error}>{(error.message || 'FEED ERROR').toUpperCase()}</div>
        ) : filtered.length === 0 ? (
          <div className={s.empty}>NO HEADLINES MATCH · TRY ANOTHER FILTER OR FEED</div>
        ) : (
          filtered.map((item, i) => (
            <FeedRow
              key={item.id}
              item={item}
              index={i}
              isSelected={i === selectedIndex}
              onSelect={handleSelect}
              onOpen={handleOpen}
              onSymbolClick={onSelectSymbol}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className={s.feed__foot}>
        <button
          className={`${s.btn} ${s['btn--ghost']} ${s['btn--sm']}`}
          onClick={onLoadMore}
          disabled={loading}
          type="button"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
        <span className={`${s.mono} ${s.muted}`}>
          {filtered.length}/{items.length} items · {filter}
        </span>
      </div>
    </section>
  );
}
