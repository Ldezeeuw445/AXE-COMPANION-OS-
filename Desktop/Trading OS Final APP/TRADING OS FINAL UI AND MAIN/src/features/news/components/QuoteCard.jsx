// ================================================================
// QuoteCard — single-symbol quote panel (pulls via dataSource)
// ================================================================

import React, { useContext } from 'react';
import { NewsContext } from '../context/NewsContext.jsx';
import { useQuote } from '../hooks/useFmpQuote.js';
import { fmtPrice, fmtPct, fmtNum } from '../utils/format.js';
import s from '../styles/news.module.css';

function Skeleton() {
  return (
    <div style={{ padding: '14px 16px' }}>
      <div className={s.skel} style={{ height: 20, width: '50%' }} />
      <div className={s.skel} style={{ height: 32, width: '70%', marginTop: 12 }} />
      <div className={s.skel} style={{ height: 14, width: '40%', marginTop: 8 }} />
      <div className={s.skel} style={{ height: 100, width: '100%', marginTop: 14 }} />
    </div>
  );
}

/** @param {{ symbol: string|null }} props */
export function QuoteCard({ symbol }) {
  const { dataSource } = useContext(NewsContext);
  const { quote, loading, error } = useQuote({ dataSource, symbol });

  return (
    <div className={`${s.quote} ${s['elevation-2']}`}>
      {!symbol ? (
        <div className={s.quote__empty}>
          <div className={s['empty-icon']}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <p className={`${s.muted} ${s.mono}`}>SEARCH A SYMBOL</p>
        </div>
      ) : loading && !quote ? (
        <Skeleton />
      ) : error ? (
        <div className={s.error}>{(error.message || 'QUOTE ERROR').toUpperCase()}</div>
      ) : quote ? (
        <QuoteContent quote={quote} />
      ) : null}
    </div>
  );
}

function QuoteContent({ quote: q }) {
  const chg = q.change ?? 0;
  const pct = q.changesPercentage ?? q.changePercentage ?? 0;
  const up  = chg >= 0;

  return (
    <>
      <div className={s.quote__head}>
        <div>
          <div className={s.quote__sym}>{q.symbol}</div>
          <div className={s.quote__name}>{q.name || ''}</div>
        </div>
        <div className={s.quote__exch}>{q.exchange || ''}</div>
      </div>

      <div className={s.quote__price}>${fmtPrice(q.price)}</div>

      <div className={`${s.quote__change} ${up ? s.up : s.down}`}>
        {up ? '▲' : '▼'} {fmtPrice(Math.abs(chg))} · {fmtPct(pct)}
      </div>

      <div className={s.quote__stats}>
        <Stat label="DAY LOW"  value={`$${fmtPrice(q.dayLow)}`} />
        <Stat label="DAY HIGH" value={`$${fmtPrice(q.dayHigh)}`} />
        <Stat label="52W LOW"  value={`$${fmtPrice(q.yearLow)}`} />
        <Stat label="52W HIGH" value={`$${fmtPrice(q.yearHigh)}`} />
        <Stat label="VOLUME"   value={fmtNum(q.volume, 0)} />
        <Stat label="AVG VOL"  value={fmtNum(q.avgVolume, 0)} />
        <Stat label="MKT CAP"  value={`$${fmtNum(q.marketCap, 0)}`} />
        <Stat label="OPEN"     value={q.open != null ? `$${fmtPrice(q.open)}` : '—'} />
      </div>
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className={s.stat}>
      <div className={s.stat__label}>{label}</div>
      <div className={s.stat__value}>{value}</div>
    </div>
  );
}
