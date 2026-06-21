// ================================================================
// StatusBar — footer with request/error counters
// Neutral branding — no FMP link.
// ================================================================

import React, { useContext } from 'react';
import { NewsContext } from '../context/NewsContext.jsx';
import s from '../styles/news.module.css';

export function StatusBar() {
  const { reqCount, errCount, status } = useContext(NewsContext);

  return (
    <footer className={`${s.statusbar} ${s['elevation-1']}`}>
      <span className={`${s.mono} ${s.muted}`}>
        TradingOS · News
      </span>
      <span className={`${s.mono} ${s.muted}`}>
        {reqCount} req · {errCount} err · {status}
      </span>
      <span className={`${s.mono} ${s.muted}`}>
        v2.0
      </span>
    </footer>
  );
}
