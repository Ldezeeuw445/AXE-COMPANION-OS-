// ================================================================
// SentimentShort — squeeze-radar panel combining short interest,
// put/call ratio, and news sentiment. Helps spot crowded trades
// and squeeze setups alongside news flow.
// ================================================================

import React from 'react';
import { useContextData } from '../hooks/useContextData.js';
import { fmtPct, fmtNum, cx, clamp } from '../utils/format.js';
import s from '../styles/context.module.css';

export function SentimentShort({ dataSource, symbol, refreshInterval = 120_000, className = '' }) {
  const { data, loading, error } = useContextData({
    dataSource,
    methodName: 'fetchSentimentShort',
    symbol,
    refreshInterval,
  });

  return (
    <div className={cx(s.panel, s.elevation2, className)}>
      <div className={s.panel__head}>
        <span className="tos-block-title">SENTIMENT · SHORT</span>
        <span className={cx(s.mono, s.muted)}>{symbol || '—'}</span>
      </div>

      {!symbol ? (
        <div className={s.empty}>SELECT A SYMBOL</div>
      ) : loading && !data ? (
        <SkeletonBlock />
      ) : error ? (
        <div className={s.error}>{(error.message || 'FAILED').toUpperCase()}</div>
      ) : !data ? (
        <div className={s.empty}>NO SENTIMENT DATA</div>
      ) : (
        <>
          {data.squeezeScore != null && <SqueezeGauge score={data.squeezeScore} />}
          {data.shortInterest && <ShortInterestBlock si={data.shortInterest} />}
          {data.putCall && <PutCallBlock pc={data.putCall} />}
          {data.newsSentiment && <NewsSentimentBlock ns={data.newsSentiment} />}
        </>
      )}
    </div>
  );
}

function SqueezeGauge({ score }) {
  const pct = clamp(score, 0, 100);
  const tone = pct >= 70 ? 'high' : pct >= 40 ? 'med' : 'low';

  return (
    <div className={s.squeeze}>
      <div className={s.squeeze__head}>
        <span className={cx(s.mono, s.muted)}>SQUEEZE SCORE</span>
        <span className={cx(s.mono, s['squeeze__score--' + tone])}>{pct.toFixed(0)}</span>
      </div>
      <div className={s.squeeze__bar}>
        <span
          className={cx(s.squeeze__fill, s['squeeze__fill--' + tone])}
          style={{ width: pct + '%' }}
        />
      </div>
    </div>
  );
}

function ShortInterestBlock({ si }) {
  const heavy = (si.shortPercentOfFloat || 0) >= 20;
  const veryHeavy = (si.shortPercentOfFloat || 0) >= 30;
  const tone = veryHeavy ? 'up' : heavy ? 'neutral' : 'down';

  return (
    <div className={s.block}>
      <div className={s.block__head}>SHORT INTEREST</div>
      <div className={s.stats}>
        {si.shortPercentOfFloat != null && (
          <Stat
            label="% OF FLOAT"
            value={fmtPct(si.shortPercentOfFloat, 1)}
            tone={tone}
            highlight={heavy}
          />
        )}
        {si.daysToCover != null && (
          <Stat label="DAYS TO COVER" value={si.daysToCover.toFixed(1)} />
        )}
        {si.borrowRate != null && (
          <Stat
            label="BORROW RATE"
            value={fmtPct(si.borrowRate, 1)}
            tone={si.borrowRate > 20 ? 'up' : 'neutral'}
          />
        )}
        {si.shortSharesOutstanding != null && (
          <Stat label="SHORT SHARES" value={fmtNum(si.shortSharesOutstanding)} />
        )}
      </div>
    </div>
  );
}

function PutCallBlock({ pc }) {
  const bearish = pc.ratio > 1.2;
  const bullish = pc.ratio < 0.7;
  const tone = bearish ? 'down' : bullish ? 'up' : 'neutral';

  return (
    <div className={s.block}>
      <div className={s.block__head}>PUT / CALL</div>
      <div className={s.stats}>
        <Stat label="TODAY" value={pc.ratio.toFixed(2)} tone={tone} highlight />
        {pc.change != null && (
          <Stat label="Δ 1D" value={fmtPct(pc.change, 1)} tone={pc.change >= 0 ? 'down' : 'up'} />
        )}
        {pc.fiveDayTrend?.length ? (
          <div className={s.sparkline}>
            {pc.fiveDayTrend.map((v, i) => {
              const max = Math.max(...pc.fiveDayTrend);
              const min = Math.min(...pc.fiveDayTrend);
              const range = max - min || 1;
              const h = ((v - min) / range) * 100;
              return <span key={i} className={s.sparkline__bar} style={{ height: Math.max(h, 4) + '%' }} />;
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NewsSentimentBlock({ ns }) {
  const score = ns.score || 0;
  const total = (ns.bullishCount || 0) + (ns.bearishCount || 0) + (ns.neutralCount || 0);
  const bullPct = total ? (ns.bullishCount / total) * 100 : 0;
  const bearPct = total ? (ns.bearishCount / total) * 100 : 0;
  const scoreTone = score > 0.15 ? 'up' : score < -0.15 ? 'down' : 'neutral';

  return (
    <div className={s.block}>
      <div className={s.block__head}>
        NEWS SENTIMENT
        <span className={cx(s.mono, s.muted)} style={{ fontSize: 10 }}>
          · {ns.windowHours}h
        </span>
      </div>
      <div className={s.stats}>
        <Stat
          label="SCORE"
          value={score.toFixed(2)}
          tone={scoreTone}
          highlight
        />
        <Stat label="BULL" value={ns.bullishCount} tone="up" />
        <Stat label="BEAR" value={ns.bearishCount} tone="down" />
      </div>
      <div className={s.sentbar}>
        <span className={cx(s.sentbar__seg, s.up)} style={{ width: bullPct + '%' }} />
        <span className={cx(s.sentbar__seg, s.down)} style={{ width: bearPct + '%' }} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone, highlight }) {
  return (
    <div className={cx(s.stat, highlight && s['stat--highlight'])}>
      <span className={cx(s.stat__label, s.mono, s.muted)}>{label}</span>
      <span className={cx(s.stat__value, s.mono, tone && s[tone])}>{value}</span>
    </div>
  );
}

function SkeletonBlock() {
  return (
    <div style={{ padding: 12 }}>
      <div className={s.skel} style={{ height: 44, marginBottom: 12 }} />
      {[...Array(4)].map((_, i) => (
        <div key={i} className={s.skel} style={{ height: 22, marginBottom: 6 }} />
      ))}
    </div>
  );
}
