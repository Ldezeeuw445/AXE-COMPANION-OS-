// ================================================================
// HotkeySheet — compact cheat-sheet for the news terminal.
// Accepts a custom rows prop so your engine can override defaults.
// ================================================================

import React from 'react';
import { cx } from '../utils/format.js';
import s from '../styles/extras.module.css';

const DEFAULT_ROWS = [
  { group: 'NAVIGATION', keys: ['j'],           label: 'Next headline' },
  { group: 'NAVIGATION', keys: ['k'],           label: 'Previous headline' },
  { group: 'NAVIGATION', keys: ['g', 'g'],      label: 'Jump to top' },
  { group: 'NAVIGATION', keys: ['shift', 'g'],  label: 'Jump to end' },

  { group: 'FEEDS', keys: ['1'], label: 'Stock feed' },
  { group: 'FEEDS', keys: ['2'], label: 'Macro feed' },
  { group: 'FEEDS', keys: ['3'], label: 'Press releases' },
  { group: 'FEEDS', keys: ['4'], label: 'FMP feed' },

  { group: 'ACTIONS', keys: ['c'],        label: 'Mount chart for symbol' },
  { group: 'ACTIONS', keys: ['a'],        label: 'Add to watchlist' },
  { group: 'ACTIONS', keys: ['s'],        label: 'Save headline' },
  { group: 'ACTIONS', keys: ['/'],        label: 'Search / filter' },
  { group: 'ACTIONS', keys: ['enter'],    label: 'Open source' },
  { group: 'ACTIONS', keys: ['esc'],      label: 'Clear selection' },

  { group: 'SYMBOL', keys: ['shift', ':'], label: 'Command palette' },
  { group: 'SYMBOL', keys: ['.'],          label: 'Swap symbol' },
  { group: 'SYMBOL', keys: ['r'],          label: 'Force refresh' },
];

export function HotkeySheet({ rows, className = '' }) {
  const data = rows && rows.length ? rows : DEFAULT_ROWS;

  // Group rows preserving first-seen order
  const groups = [];
  const seen = new Map();
  for (const r of data) {
    const g = r.group || 'GENERAL';
    if (!seen.has(g)) {
      seen.set(g, groups.length);
      groups.push({ name: g, rows: [] });
    }
    groups[seen.get(g)].rows.push(r);
  }

  return (
    <div className={cx(s.panel, s.elevation2, className)}>
      <div className={s.panel__head}>
        <span className={s.mono}>HOTKEYS</span>
        <span className={cx(s.mono, s.muted)}>TERMINAL</span>
      </div>

      <div className={s.hkBody}>
        {groups.map((g) => (
          <div key={g.name} className={s.hkGroup}>
            <div className={s.hkGroupLabel}>{g.name}</div>
            <div className={s.hkRows}>
              {g.rows.map((r, i) => (
                <div key={i} className={s.hkRow}>
                  <span className={s.hkKeys}>
                    {r.keys.map((k, j) => (
                      <React.Fragment key={j}>
                        {j > 0 && <span className={s.hkPlus}>+</span>}
                        <kbd className={s.kbd}>{formatKey(k)}</kbd>
                      </React.Fragment>
                    ))}
                  </span>
                  <span className={s.hkLabel}>{r.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatKey(k) {
  const map = { shift: '⇧', ctrl: '⌃', cmd: '⌘', alt: '⌥', enter: '↵', esc: 'esc' };
  return map[k] ?? k;
}
