// ================================================================
// ContextPanels — wrapper that renders the 4 symbol-aware panels
// in left / right / both layouts. All panels share one dataSource
// and respond to the same `symbol` prop.
// ================================================================

import React from 'react';
import { AnalystConsensus } from './components/AnalystConsensus.jsx';
import { PeersRelative }    from './components/PeersRelative.jsx';
import { KeyLevels }        from './components/KeyLevels.jsx';
import { SentimentShort }   from './components/SentimentShort.jsx';
import { cx }               from './utils/format.js';
import s                    from './styles/context.module.css';

/**
 * @param {Object}  props
 * @param {Object}  props.dataSource        - ContextDataSource adapter
 * @param {string}  props.symbol            - Currently selected ticker
 * @param {'left'|'right'|'both'} [props.side='left']
 * @param {number}  [props.refreshInterval] - Override auto-refresh interval (ms)
 * @param {string}  [props.className]
 * @param {boolean} [props.naturalHeight] - Shrink to content; use when the outer column scrolls (News page).
 */
export function ContextPanels({
  dataSource,
  symbol,
  side = 'left',
  refreshInterval,
  className = '',
  naturalHeight = false,
}) {
  const commonProps = { dataSource, symbol };
  if (refreshInterval != null) commonProps.refreshInterval = refreshInterval;

  const wrap = (inner) => (
    <div className={cx(s.panels, naturalHeight && s.panelsNatural, className)}>{inner}</div>
  );

  if (side === 'left') {
    return wrap(
      <>
        <AnalystConsensus {...commonProps} />
        <PeersRelative    {...commonProps} />
      </>
    );
  }

  if (side === 'right') {
    return wrap(
      <>
        <KeyLevels       {...commonProps} />
        <SentimentShort  {...commonProps} />
      </>
    );
  }

  // side === 'both'
  return (
    <div className={cx(s.panels, s['panels--both'], className)}>
      <div className={cx(s.panels, naturalHeight && s.panelsNatural)}>
        <AnalystConsensus {...commonProps} />
        <PeersRelative    {...commonProps} />
      </div>
      <div className={cx(s.panels, naturalHeight && s.panelsNatural)}>
        <KeyLevels       {...commonProps} />
        <SentimentShort  {...commonProps} />
      </div>
    </div>
  );
}
