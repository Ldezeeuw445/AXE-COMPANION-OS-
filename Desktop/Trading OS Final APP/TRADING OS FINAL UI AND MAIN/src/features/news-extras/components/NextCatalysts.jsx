// ================================================================
// NextCatalysts — upcoming events grouped by time.
// Pulls from catalystsDataSource.fetchCatalysts, which your
// shared engine should stitch together from the earnings calendar,
// macro calendar, Fed schedule, and custom events.
// ================================================================

import React, { useMemo } from 'react';
import { useAsync } from '../hooks/useAsync.js';
import {
  cx,
  relativeTime,
  absoluteClock,
  CATALYST_COLOR,
} from '../utils/format.js';
import s from '../styles/extras.module.css';

export function NextCatalysts({
  dataSource,
  symbol,
  windowHours = 48,
  refreshInterval = 60_000,
  className = '',
}) {
  const q = useAsync({
    fetcher: dataSource
      ? ({ signal }) => dataSource.fetchCatalysts({ windowHours, symbol: symbol ?? null, signal })
      : null,
    deps: [dataSource, windowHours, symbol],
    refreshInterval,
  });

  const items = q.data?.catalysts || [];
  const { imminent, today, upcoming } = useMemo(() => groupCatalysts(items), [items]);

  return (
    <div className={cx(s.panel, s.elevation2, className)}>
      <div className={s.panel__head}>
        <span className={s.mono}>NEXT CATALYSTS</span>
        <span className={cx(s.mono, s.muted)}>{windowHours}h · {items.length}</span>
      </div>

      {q.loading && !items.length ? (
        <Skel rows={4} />
      ) : q.error ? (
        <div className={s.error}>{(q.error.message || 'FAILED').toUpperCase()}</div>
      ) : items.length === 0 ? (
        <div className={s.empty}>NO CATALYSTS IN WINDOW</div>
      ) : (
        <>
          {imminent.length > 0 && (
            <Group label="< 2H" items={imminent} highlight />
          )}
          {today.length > 0 && (
            <Group label="TODAY" items={today} />
          )}
          {upcoming.length > 0 && (
            <Group label="UPCOMING" items={upcoming} />
          )}
        </>
      )}
    </div>
  );
}

function Group({ label, items, highlight }) {
  return (
    <div className={s.group}>
      <div className={cx(s.groupHead, highlight && s['groupHead--urgent'])}>
        <span>{label}</span>
        <span className={cx(s.mono, s.muted)}>{items.length}</span>
      </div>
      <div className={s.catList}>
        {items.map((c) => (
          <CatalystRow key={c.id} catalyst={c} highlight={highlight} />
        ))}
      </div>
    </div>
  );
}

function CatalystRow({ catalyst, highlight }) {
  const color = CATALYST_COLOR[catalyst.kind] || '#9aa0a6';
  return (
    <div
      className={cx(s.cat, highlight && s['cat--urgent'])}
      onClick={() =>
        catalyst.sourceUrl && window.open(catalyst.sourceUrl, '_blank', 'noopener')
      }
      style={{ cursor: catalyst.sourceUrl ? 'pointer' : 'default' }}
    >
      <span className={s.catDot} style={{ background: color }} />
      <div className={s.catText}>
        <div className={s.catTitle}>
          {catalyst.symbol && (
            <span className={s.catSym}>{catalyst.symbol}</span>
          )}
          <span>{catalyst.title}</span>
          {catalyst.note && (
            <span className={cx(s.mono, s.muted, s.catNote)}>{catalyst.note}</span>
          )}
        </div>
        <div className={s.catSub}>
          <span className={cx(s.mono, s.muted)}>{absoluteClock(catalyst.startAt)}</span>
          <span className={s.sep}>·</span>
          <span className={cx(s.mono, highlight ? s.up : s.muted)}>
            {relativeTime(catalyst.startAt)}
          </span>
        </div>
      </div>
      <span
        className={cx(s.impact, s['impact--' + (catalyst.impact || 'low')])}
        aria-label={`Impact ${catalyst.impact}`}
      />
    </div>
  );
}

function Skel({ rows }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 4 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={s.skel} style={{ height: 36 }} />
      ))}
    </div>
  );
}

function groupCatalysts(items) {
  const now = Date.now();
  const twoH = 2 * 60 * 60 * 1000;
  const endOfTodayUtc = new Date();
  endOfTodayUtc.setUTCHours(23, 59, 59, 999);
  const endOfToday = endOfTodayUtc.getTime();

  const imminent = [];
  const today = [];
  const upcoming = [];

  const sorted = [...items].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );

  for (const c of sorted) {
    const t = new Date(c.startAt).getTime();
    const diff = t - now;
    if (diff <= 0) continue;                // skip past
    if (diff <= twoH)           imminent.push(c);
    else if (t <= endOfToday)   today.push(c);
    else                        upcoming.push(c);
  }
  return { imminent, today, upcoming };
}
