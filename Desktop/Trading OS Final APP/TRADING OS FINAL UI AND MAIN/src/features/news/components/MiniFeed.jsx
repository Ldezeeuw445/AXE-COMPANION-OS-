// ================================================================
// MiniFeed — small secondary feed (MACRO or PRESS)
// Pulls data via dataSource.fetchMiniFeed() through useMiniFeed hook.
// ================================================================

import React, { useContext } from 'react';
import { NewsContext } from '../context/NewsContext.jsx';
import { useMiniFeed } from '../hooks/useMiniFeed.js';
import { hhmm } from '../utils/format.js';
import s from '../styles/news.module.css';

/**
 * @param {{ kind: 'general'|'press', label: string }} props
 */
export function MiniFeed({ kind, label }) {
  const { dataSource } = useContext(NewsContext);
  const { items, loading, error, refresh } = useMiniFeed({ dataSource, kind });

  return (
    <div className={`${s.mini} ${s['elevation-2']}`}>
      <div className={s.mini__head}>
        <span className={s.mono}>{label}</span>
        <button
          className={`${s.iconbtn} ${s['iconbtn--xs']}`}
          title="Refresh"
          onClick={refresh}
          type="button"
        >
          ↻
        </button>
      </div>

      <ul className={s.minilist}>
        {loading && !items.length ? (
          Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className={`${s.skel} ${s['skel-row']}`} style={{ margin: '6px 12px' }} />
          ))
        ) : error ? (
          <li className={s.error} style={{ margin: 8 }}>
            {(error.message || 'FAILED').toUpperCase()}
          </li>
        ) : items.length === 0 ? (
          <li className={s.empty} style={{ margin: 8 }}>NO ITEMS</li>
        ) : (
          items.map((item) => (
            <li
              key={item.id}
              className={s['mini-row']}
              onClick={() => item.url && window.open(item.url, '_blank', 'noopener')}
            >
              <span className={s['mini-row__time']}>{hhmm(item.publishedAt)}</span>
              <span className={s['mini-row__text']}>{item.title}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
