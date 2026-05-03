// ================================================================
// AnalystConsensus — panel showing ratings breakdown, price target,
// and recent upgrade/downgrade actions for the selected symbol.
// ================================================================

import React from 'react';
import { useContextData } from '../hooks/useContextData.js';
import { fmtPrice, fmtPct, cx, ago } from '../utils/format.js';
import s from '../styles/context.module.css';

const ACTION_LABEL = {
  upgrade:        { text: 'UPGRADE',    tone: 'up' },
  downgrade:      { text: 'DOWNGRADE',  tone: 'down' },
  initiate:       { text: 'INITIATE',   tone: 'neutral' },
  reiterate:      { text: 'REITERATE',  tone: 'neutral' },
  target_raised:  { text: 'TARGET +',   tone: 'up' },
  target_lowered: { text: 'TARGET -',   tone: 'down' },
};

export function AnalystConsensus({ dataSource, symbol, refreshInterval = 60_000, className = '' }) {
  const { data, loading, error } = useContextData({
    dataSource,
    methodName: 'fetchAnalystConsensus',
    symbol,
    refreshInterval,
  });

  return (
    <div className={cx(s.panel, s.elevation2, className)}>
      <div className={s.panel__head}>
        <span className="tos-block-title">ANALYST CONSENSUS</span>
        <span className={cx(s.mono, s.muted)}>{symbol || '—'}</span>
      </div>

      {!symbol ? (
        <div className={s.empty}>SELECT A SYMBOL</div>
      ) : loading && !data ? (
        <SkeletonBlock />
      ) : error ? (
        <div className={s.error}>{(error.message || 'FAILED').toUpperCase()}</div>
      ) : !data ? (
        <div className={s.empty}>NO COVERAGE</div>
      ) : (
        <>
          <PriceTargetBlock data={data} />
          <RatingsBar ratings={data.ratings} />
          <ActionsList actions={data.recentActions} />
        </>
      )}
    </div>
  );
}

function PriceTargetBlock({ data }) {
  const upside = data.target.average && data.currentPrice
    ? ((data.target.average - data.currentPrice) / data.currentPrice) * 100
    : null;
  const upsideClass = upside > 0 ? s.up : upside < 0 ? s.down : s.neutral;

  return (
    <div className={s.target}>
      <div className={s.target__row}>
        <span className={cx(s.mono, s.muted)}>AVG TARGET</span>
        <span className={s.target__value}>${fmtPrice(data.target.average)}</span>
      </div>
      <div className={s.target__row}>
        <span className={cx(s.mono, s.muted)}>UPSIDE</span>
        <span className={cx(s.target__value, upsideClass)}>{fmtPct(upside)}</span>
      </div>
      <div className={s.target__row}>
        <span className={cx(s.mono, s.muted)}>RANGE</span>
        <span className={s.target__range}>
          ${fmtPrice(data.target.low)} – ${fmtPrice(data.target.high)}
        </span>
      </div>
      <div className={s.target__row}>
        <span className={cx(s.mono, s.muted)}>ANALYSTS</span>
        <span className={s.mono}>{data.target.numberOfAnalysts}</span>
      </div>
    </div>
  );
}

function RatingsBar({ ratings }) {
  const total =
    (ratings.strongBuy || 0) + (ratings.buy || 0) + (ratings.hold || 0) +
    (ratings.sell || 0) + (ratings.strongSell || 0);
  if (!total) return null;

  const pct = (n) => ((n || 0) / total) * 100;

  return (
    <div className={s.ratings}>
      <div className={s.ratings__bar}>
        <span style={{ width: pct(ratings.strongBuy) + '%' }} className={s['ratings__seg--strong-buy']} />
        <span style={{ width: pct(ratings.buy)        + '%' }} className={s['ratings__seg--buy']} />
        <span style={{ width: pct(ratings.hold)       + '%' }} className={s['ratings__seg--hold']} />
        <span style={{ width: pct(ratings.sell)       + '%' }} className={s['ratings__seg--sell']} />
        <span style={{ width: pct(ratings.strongSell) + '%' }} className={s['ratings__seg--strong-sell']} />
      </div>
      <div className={s.ratings__legend}>
        <Legend label="SB" count={ratings.strongBuy} cls="strong-buy" />
        <Legend label="B"  count={ratings.buy}        cls="buy" />
        <Legend label="H"  count={ratings.hold}       cls="hold" />
        <Legend label="S"  count={ratings.sell}       cls="sell" />
        <Legend label="SS" count={ratings.strongSell} cls="strong-sell" />
      </div>
    </div>
  );
}

function Legend({ label, count, cls }) {
  return (
    <div className={s.legend}>
      <span className={cx(s.legend__dot, s['legend__dot--' + cls])} />
      <span className={s.mono}>{label}</span>
      <span className={cx(s.mono, s.muted)}>{count || 0}</span>
    </div>
  );
}

function ActionsList({ actions }) {
  if (!actions?.length) {
    return <div className={s.empty} style={{ paddingTop: 6 }}>NO RECENT ACTIONS</div>;
  }

  return (
    <ul className={s.actionlist}>
      {actions.slice(0, 8).map((a) => {
        const meta = ACTION_LABEL[a.action] || { text: a.action.toUpperCase(), tone: 'neutral' };
        return (
          <li
            key={a.id}
            className={s.action}
            onClick={() => a.url && window.open(a.url, '_blank', 'noopener')}
            style={{ cursor: a.url ? 'pointer' : 'default' }}
          >
            <span className={cx(s.action__tag, s['action__tag--' + meta.tone])}>{meta.text}</span>
            <span className={s.action__firm}>{a.firm}</span>
            <span className={s.action__move}>
              {a.fromTarget && a.toTarget ? (
                <>
                  ${fmtPrice(a.fromTarget)} → ${fmtPrice(a.toTarget)}
                </>
              ) : a.toTarget ? (
                <>PT ${fmtPrice(a.toTarget)}</>
              ) : a.toRating ? (
                <>→ {a.toRating}</>
              ) : null}
            </span>
            <span className={cx(s.mono, s.muted, s.action__ago)}>{ago(a.publishedAt)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function SkeletonBlock() {
  return (
    <div style={{ padding: 12 }}>
      <div className={s.skel} style={{ height: 64, marginBottom: 10 }} />
      <div className={s.skel} style={{ height: 18, marginBottom: 10 }} />
      {[...Array(4)].map((_, i) => (
        <div key={i} className={s.skel} style={{ height: 22, marginBottom: 6 }} />
      ))}
    </div>
  );
}
