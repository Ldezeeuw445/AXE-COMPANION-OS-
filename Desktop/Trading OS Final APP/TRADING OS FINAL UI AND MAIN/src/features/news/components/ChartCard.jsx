// ================================================================
// ChartCard — render-prop wrapper for your chart (e.g. TradingView
// Lightweight Charts).
//
// Usage:
//   <ChartCard
//     symbol="AAPL"
//     renderChart={({ symbol }) => <MyTVChart symbol={symbol} />}
//   />
//
// If renderChart is omitted, a neutral placeholder is rendered.
// The chart content gets a flex-filling container — your chart can
// size itself to 100% width/height.
// ================================================================

import React from 'react';
import s from '../styles/news.module.css';

/**
 * @param {{
 *   symbol: string|null,
 *   renderChart?: (ctx: { symbol: string }) => React.ReactNode,
 * }} props
 */
export function ChartCard({ symbol, renderChart }) {
  return (
    <div className={`${s.chartcard} ${s['elevation-2']}`}>
      <div className={s.chartcard__head}>
        <span className={s.mono}>CHART</span>
        <span className={`${s.mono} ${s.muted}`}>{symbol || '—'}</span>
      </div>

      <div className={`${s.chartcard__body} ${s['elevation-3']}`}>
        {renderChart && symbol ? (
          renderChart({ symbol })
        ) : (
          <div className={s.chartcard__placeholder}>
            <div className={`${s.mono} ${s.muted}`} style={{ fontSize: 11, letterSpacing: '0.1em' }}>
              NO CHART MOUNTED
            </div>
            {!symbol && (
              <div className={s.muted} style={{ fontSize: 11, marginTop: 6 }}>
                Select a symbol to display
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
