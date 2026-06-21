// ================================================================
// LeftRail — feed tabs, filter pills, watchlist, trending, stream toggle
// Pulls feed/filter/stream from context; ticker quotes via useTicker.
// ================================================================

import React, { useContext } from 'react';
import { NewsContext } from '../context/NewsContext.jsx';
import { useTicker } from '../hooks/useTicker.js';
import styles from '../styles/news.module.css';
import { cx, fmtPct } from '../utils/format.js';
import { FEEDS, FILTER_TAGS, TRENDING_SYMBOLS } from '../utils/constants';

export function LeftRail({
  feedCount,
  watchlist,
  onAddToWatchlist,
  onRemoveFromWatchlist,
  onSelectSymbol,
  nextPollIn,
}) {
  const { dataSource, feed, setFeed, filter, setFilter, stream, setStream } = useContext(NewsContext);
  const { quotes: watchQuotes } = useTicker({ dataSource, symbols: watchlist });

  const secsToNext = nextPollIn != null ? Math.max(0, Math.round(nextPollIn / 1000)) : null;

  return (
    <aside className={cx(styles.rail, styles.elevation2)}>
      {/* FEED */}
      <section className={styles.railSection}>
        <div className={styles.railHead}>
          <span>FEED</span>
          <span className={cx(styles.mono, styles.muted)}>{feedCount}</span>
        </div>
        <div className={styles.feedtabs} role="tablist">
          {FEEDS.map((f) => (
            <button
              key={f.key}
              className={cx(styles.feedtab, feed === f.key && styles.feedtabActive)}
              onClick={() => setFeed(f.key)}
              role="tab"
              type="button"
            >
              <span className={styles.kbdnum}>{f.shortcut}</span> {f.label}
            </button>
          ))}
        </div>
      </section>

      {/* FILTER */}
      <section className={styles.railSection}>
        <div className={styles.railHead}><span>FILTER</span></div>
        <div className={styles.pillrow}>
          {FILTER_TAGS.map((t) => (
            <button
              key={t}
              className={cx(styles.pill, filter === t && styles.pillActive)}
              onClick={() => setFilter(t)}
              type="button"
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      {/* WATCHLIST */}
      <section className={styles.railSection}>
        <div className={styles.railHead}>
          <span>WATCHLIST</span>
          <button
            className={cx(styles.iconbtn, styles.iconbtnXs)}
            onClick={onAddToWatchlist}
            type="button"
            title="Add current symbol (a)"
          >
            +
          </button>
        </div>
        <ul className={styles.watchlist}>
          {watchlist.length === 0 && (
            <li className={styles.watchlistEmpty}>Empty · press A to add</li>
          )}
          {watchlist.map((sym) => {
            const q = watchQuotes[sym];
            const pct = q ? (q.changesPercentage ?? q.changePercentage ?? 0) : null;
            const up = q ? (q.change ?? 0) >= 0 : false;
            return (
              <li
                key={sym}
                className={styles.watchItem}
                onClick={() => onSelectSymbol(sym)}
              >
                <span className={styles.watchItemSym}>{sym}</span>
                <span
                  className={styles.watchItemChg}
                  style={{ color: q ? (up ? 'var(--tos-up)' : 'var(--tos-down)') : 'var(--tos-text-dim)' }}
                >
                  {q ? fmtPct(pct) : '—'}
                </span>
                <button
                  className={styles.watchItemRemove}
                  onClick={(e) => { e.stopPropagation(); onRemoveFromWatchlist(sym); }}
                  type="button"
                  title="Remove"
                >×</button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* TRENDING */}
      <section className={styles.railSection}>
        <div className={styles.railHead}><span>TRENDING</span></div>
        <div className={styles.chips}>
          {TRENDING_SYMBOLS.map((sym) => (
            <button
              key={sym}
              className={styles.chip}
              onClick={() => onSelectSymbol(sym)}
              type="button"
            >
              {sym}
            </button>
          ))}
        </div>
      </section>

      {/* STREAM */}
      <section className={styles.railSection}>
        <div className={styles.railHead}><span>STREAM</span></div>
        <div className={styles.stream}>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={stream}
              onChange={(e) => setStream(e.target.checked)}
            />
            <span className={styles.switchSlider} />
            <span className={styles.switchLabel}>Auto-refresh</span>
          </label>
          <div className={cx(styles.mono, styles.muted)} style={{ fontSize: 10, marginTop: 8 }}>
            Next poll: {stream ? (secsToNext != null ? `${secsToNext}s` : '—') : 'off'}
          </div>
        </div>
      </section>
    </aside>
  );
}
