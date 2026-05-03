// ================================================================
// TickerTape — horizontal watchlist tape with live-ish quotes
// Pulls data via dataSource.fetchTicker() through useTicker hook.
// ================================================================

import React, { useContext } from 'react';
import { NewsContext } from '../context/NewsContext.jsx';
import { useTicker } from '../hooks/useTicker.js';
import styles from '../styles/news.module.css';
import { cx, fmtPrice, fmtPct } from '../utils/format.js';

/**
 * @param {{ watchlist: string[], onSelectSymbol: (sym: string) => void }} props
 */
export function TickerTape({ watchlist, onSelectSymbol }) {
  const { dataSource } = useContext(NewsContext);
  const { quotes } = useTicker({ dataSource, symbols: watchlist });

  if (!watchlist.length) {
    return (
      <div className={cx(styles.tapebar, styles.elevation2)}>
        <div className={cx(styles.muted, styles.mono)} style={{ padding: '4px 8px', fontSize: 11 }}>
          WATCHLIST EMPTY
        </div>
      </div>
    );
  }

  return (
    <div className={cx(styles.tapebar, styles.elevation2)}>
      <div className={styles.tape}>
        {watchlist.slice(0, 16).map((sym) => {
          const q = quotes[sym];
          if (!q) {
            return (
              <button
                key={sym}
                className={styles.tapeItem}
                onClick={() => onSelectSymbol(sym)}
                type="button"
              >
                <span className={styles.tapeItemSym}>{sym}</span>
                <span className={styles.tapeItemPrice}>—</span>
              </button>
            );
          }
          const pct = q.changesPercentage ?? q.changePercentage ?? 0;
          const up = (q.change ?? 0) >= 0;
          return (
            <button
              key={sym}
              className={styles.tapeItem}
              onClick={() => onSelectSymbol(sym)}
              type="button"
            >
              <span className={styles.tapeItemSym}>{sym}</span>
              <span className={styles.tapeItemPrice}>${fmtPrice(q.price)}</span>
              <span className={cx(styles.tapeItemChg, up ? styles.up : styles.down)}>
                {up ? '▲' : '▼'} {fmtPct(pct)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
