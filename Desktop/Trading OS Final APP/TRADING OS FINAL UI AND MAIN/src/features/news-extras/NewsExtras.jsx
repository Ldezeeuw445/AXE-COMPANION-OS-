// ================================================================
// NewsExtras — convenience wrapper that stacks the three panels.
// Render them individually if you need full control over layout.
// ================================================================

import React from 'react';
import { QuickAlerts }   from './components/QuickAlerts.jsx';
import { NextCatalysts } from './components/NextCatalysts.jsx';
import { HotkeySheet }   from './components/HotkeySheet.jsx';
import { cx } from './utils/format.js';
import s from './styles/extras.module.css';

/**
 * @param {Object}  props
 * @param {Object}  [props.alertsDataSource]
 * @param {Object}  [props.catalystsDataSource]
 * @param {string}  [props.symbol]
 * @param {Array<'alerts'|'catalysts'|'hotkeys'>} [props.panels]
 * @param {Array}   [props.hotkeyRows]
 * @param {number}  [props.catalystWindowHours]
 * @param {string}  [props.className]
 */
export function NewsExtras({
  alertsDataSource,
  catalystsDataSource,
  symbol,
  panels = ['alerts', 'catalysts', 'hotkeys'],
  hotkeyRows,
  catalystWindowHours = 48,
  className = '',
}) {
  return (
    <div className={cx(s.stack, className)}>
      {panels.includes('alerts') && (
        <QuickAlerts dataSource={alertsDataSource} symbol={symbol} />
      )}
      {panels.includes('catalysts') && (
        <NextCatalysts
          dataSource={catalystsDataSource}
          symbol={symbol}
          windowHours={catalystWindowHours}
        />
      )}
      {panels.includes('hotkeys') && <HotkeySheet rows={hotkeyRows} />}
    </div>
  );
}
