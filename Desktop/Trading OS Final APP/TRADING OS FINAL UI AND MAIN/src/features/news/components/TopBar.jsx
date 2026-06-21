// ================================================================
// TopBar — brand + command bar + clock + status + help
// Pulls status from context; no API-key UI.
// ================================================================

import React, { useContext, useEffect, useState } from 'react';
import { NewsContext } from '../context/NewsContext.jsx';
import styles from '../styles/news.module.css';
import { cx } from '../utils/format.js';
import { CommandBar } from './CommandBar.jsx';

const STATUS_LABEL = {
  idle:    'IDLE',
  loading: 'SYNC',
  live:    'LIVE',
  error:   'ERR',
};

export function TopBar({ onSelectSymbol, onShowHelp, searchInputRef, onHideSuggestions }) {
  const { status } = useContext(NewsContext);
  const [clock, setClock] = useState('--:--:--');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const loc = now.toLocaleTimeString('en-US', { hour12: false });
      const utc = now.toISOString().substring(11, 19);
      setClock(`${loc} · ${utc} UTC`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const statusCls =
    status === 'live'    ? styles.statusLive :
    status === 'error'   ? styles.statusError :
    status === 'loading' ? styles.statusLoading : '';

  return (
    <header className={cx(styles.topbar, styles.elevation1)}>
      <div className={styles.topbarBrand}>
        <span className={styles.logoDot} />
        <div>
          <div className={styles.brandSub}>NEWS · TERMINAL</div>
        </div>
      </div>

      <CommandBar
        onSelectSymbol={onSelectSymbol}
        searchInputRef={searchInputRef}
        onHideSuggestions={onHideSuggestions}
      />

      <div className={styles.topbarActions}>
        <div className={cx(styles.clock, styles.mono)} title="Local · UTC">{clock}</div>
        <div className={cx(styles.status, statusCls)} title="Data status">
          <span className={styles.statusIndicator} />
          <span className={styles.statusLabel}>{STATUS_LABEL[status] || 'IDLE'}</span>
        </div>
        <button
          className={styles.iconbtn}
          onClick={onShowHelp}
          title="Keyboard shortcuts (?)"
          type="button"
        >
          ?
        </button>
      </div>
    </header>
  );
}
