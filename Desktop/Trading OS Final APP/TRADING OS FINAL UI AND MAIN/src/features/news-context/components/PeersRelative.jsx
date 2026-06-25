// ================================================================
// PeersRelative — panel showing selected symbol vs. sector peers,
// sector average, and benchmark (SPY/QQQ). Answers the question:
// "is this stock-specific or sector-wide movement?"
// ================================================================

import React from 'react';
import { useContextData } from '../hooks/useContextData.js';
import { fmtPct, fmtPrice, cx } from '../utils/format.js';
import s from '../styles/context.module.css';

export function PeersRelative({ dataSource, symbol, refreshInterval = 30_000, className = '' }) {
  const { data, loading, error } = useContextData({
    dataSource,
    methodName: 'fetchRelativePerformance',
    symbol,
    refreshInterval,
  });

  return (
    <div className={cx(s.panel, s.elevation2, className)}>
      <div className={s.panel__head}>
        <span className="tos-block-title">PEERS · RELATIVE</span>
        <span className={cx(s.mono, s.muted)}>
          {data?.sectorName || symbol || '—'}
        </span>
      </div>

      {!symbol ? (
        <div className={s.empty}>SELECT A SYMBOL</div>
      ) : loading && !data ? (
        <SkeletonBars />
      ) : error ? (
        <div className={s.error}>{(error.message || 'FAILED').toUpperCase()}</div>
      ) : !data || !data.peers?.length ? (
        <div className={s.empty}>NO PEER DATA</div>
      ) : (
        <PeersContent data={data} />
      )}
    </div>
  );
}

function PeersContent({ data }) {
  // Combine peers + benchmark + sector average into one comparison set
  const rows = [...data.peers];

  if (data.sectorAverage != null) {
    rows.push({
      symbol: 'SECTOR',
      name: data.sectorName || 'Sector avg',
      changePercent: data.sectorAverage,
      price: 0,
      isSector: true,
    });
  }

  if (data.benchmark) {
    rows.push({
      symbol: data.benchmark.symbol,
      name: 'Benchmark',
      changePercent: data.benchmark.changePercent,
      price: 0,
      isBenchmark: true,
    });
  }

  // Find max absolute value for bar scaling
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.changePercent || 0)), 0.1);

  // Sort: selected symbol first, then by change desc
  const sorted = rows.slice().sort((a, b) => {
    if (a.isSelected) return -1;
    if (b.isSelected) return 1;
    return (b.changePercent || 0) - (a.changePercent || 0);
  });

  return (
    <div className={s.peers}>
      {sorted.map((p) => {
        const pct = p.changePercent || 0;
        const barPct = (Math.abs(pct) / maxAbs) * 50;    // 50% max width per side
        const up = pct >= 0;
        const rowCls = [
          s.peers__row,
          p.isSelected   ? s['peers__row--selected']  : '',
          p.isBenchmark  ? s['peers__row--benchmark'] : '',
          p.isSector     ? s['peers__row--sector']    : '',
        ].filter(Boolean).join(' ');

        return (
          <div key={p.symbol} className={rowCls}>
            <span className={s.peers__sym}>{p.symbol}</span>
            <div className={s.peers__bar}>
              <span className={s.peers__bar__center} />
              <span
                className={cx(s.peers__bar__fill, up ? s.up : s.down)}
                style={{
                  width: barPct + '%',
                  left: up ? '50%' : `${50 - barPct}%`,
                }}
              />
            </div>
            <span className={cx(s.peers__pct, up ? s.up : s.down)}>{fmtPct(pct)}</span>
          </div>
        );
      })}
    </div>
  );
}

function SkeletonBars() {
  return (
    <div style={{ padding: 12 }}>
      {[...Array(6)].map((_, i) => (
        <div key={i} className={s.skel} style={{ height: 22, marginBottom: 6 }} />
      ))}
    </div>
  );
}
