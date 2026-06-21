// ================================================================
// KeyLevels — technical snapshot: 52W range, ATH drawdown,
// moving averages, indicators (RSI/MACD), and support/resistance.
// ================================================================

import React from 'react';
import { useContextData } from '../hooks/useContextData.js';
import { fmtPrice, fmtPct, cx, clamp } from '../utils/format.js';
import s from '../styles/context.module.css';

export function KeyLevels({ dataSource, symbol, refreshInterval = 30_000, className = '' }) {
  const { data, loading, error } = useContextData({
    dataSource,
    methodName: 'fetchKeyLevels',
    symbol,
    refreshInterval,
  });

  return (
    <div className={cx(s.panel, s.elevation2, className)}>
      <div className={s.panel__head}>
        <span className="tos-block-title">KEY LEVELS · TECHNICAL</span>
        <span className={cx(s.mono, s.muted)}>{symbol || '—'}</span>
      </div>

      {!symbol ? (
        <div className={s.empty}>SELECT A SYMBOL</div>
      ) : loading && !data ? (
        <SkeletonBlock />
      ) : error ? (
        <div className={s.error}>{(error.message || 'FAILED').toUpperCase()}</div>
      ) : !data ? (
        <div className={s.empty}>NO TECHNICAL DATA</div>
      ) : (
        <>
          <WeekRange data={data} />
          <MovingAverages data={data} />
          <Indicators data={data} />
          <LevelsList data={data} />
        </>
      )}
    </div>
  );
}

function WeekRange({ data }) {
  const { week52Low, week52High, currentPrice, ath, drawdownFromAth } = data;
  const pct = week52High > week52Low
    ? clamp(((currentPrice - week52Low) / (week52High - week52Low)) * 100, 0, 100)
    : 50;

  return (
    <div className={s.range}>
      <div className={s.range__head}>
        <span className={cx(s.mono, s.muted)}>52W RANGE</span>
        <span className={s.mono}>${fmtPrice(currentPrice)}</span>
      </div>
      <div className={s.range__bar}>
        <span className={s.range__marker} style={{ left: pct + '%' }} />
      </div>
      <div className={s.range__labels}>
        <span className={cx(s.mono, s.muted)}>${fmtPrice(week52Low)}</span>
        <span className={cx(s.mono, s.muted)}>${fmtPrice(week52High)}</span>
      </div>

      {ath != null && drawdownFromAth != null && (
        <div className={s.range__ath}>
          <span className={cx(s.mono, s.muted)}>ATH ${fmtPrice(ath)}</span>
          <span className={cx(s.mono, drawdownFromAth < 0 ? s.down : s.neutral)}>
            {fmtPct(drawdownFromAth)} from ATH
          </span>
        </div>
      )}
    </div>
  );
}

function MovingAverages({ data }) {
  if (!data.movingAverages?.length) return null;

  return (
    <div className={s.ma}>
      {data.movingAverages.map((m) => {
        const above = m.distancePercent >= 0;
        return (
          <div key={m.period} className={s.ma__item}>
            <span className={cx(s.mono, s.muted)}>{m.period}MA</span>
            <span className={s.mono}>${fmtPrice(m.value)}</span>
            <span className={cx(s.mono, above ? s.up : s.down)}>
              {above ? '▲' : '▼'} {fmtPct(m.distancePercent)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Indicators({ data }) {
  if (!data.indicators?.length) return null;

  return (
    <div className={s.indicators}>
      {data.indicators.map((ind, i) => (
        <div key={i} className={s.indicator}>
          <span className={cx(s.mono, s.muted)}>{ind.name}</span>
          <span className={s.mono}>{ind.value != null ? Number(ind.value).toFixed(2) : '—'}</span>
          {ind.signal && (
            <span className={cx(s.indicator__signal, s['indicator__signal--' + ind.signal])}>
              {ind.signal.toUpperCase()}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function LevelsList({ data }) {
  if (!data.levels?.length) return null;

  return (
    <ul className={s.levels}>
      {data.levels.slice(0, 6).map((l, i) => {
        const up = l.distancePercent != null && l.distancePercent >= 0;
        return (
          <li key={i} className={s.level}>
            <span className={cx(s.level__dot, s['level__dot--' + l.kind])} />
            <span className={cx(s.mono, s.muted)}>{l.label}</span>
            <span className={s.mono}>${fmtPrice(l.price)}</span>
            {l.distancePercent != null && (
              <span className={cx(s.mono, up ? s.up : s.down)}>{fmtPct(l.distancePercent)}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SkeletonBlock() {
  return (
    <div style={{ padding: 12 }}>
      <div className={s.skel} style={{ height: 44, marginBottom: 12 }} />
      {[...Array(5)].map((_, i) => (
        <div key={i} className={s.skel} style={{ height: 20, marginBottom: 6 }} />
      ))}
    </div>
  );
}
