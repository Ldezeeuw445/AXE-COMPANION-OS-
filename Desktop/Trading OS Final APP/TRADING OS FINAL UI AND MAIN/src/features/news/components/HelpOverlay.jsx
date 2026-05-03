// ================================================================
// TradingOS · News Terminal v2 — HelpOverlay
// Keyboard shortcuts reference panel
// ================================================================

import React, { useEffect } from 'react';
import s from '../styles/news.module.css';

const SHORTCUTS = [
  { keys: ['/'],                description: 'Focus search' },
  { keys: ['Esc'],              description: 'Blur / close' },
  { keys: ['j', '↓'],          description: 'Next headline' },
  { keys: ['k', '↑'],          description: 'Previous headline' },
  { keys: ['Enter'],            description: 'Open selected headline' },
  { keys: ['c'],                description: 'Open selected in chart' },
  { keys: ['1', '2', '3', '4'],description: 'Switch feed (Stock · Macro · Press · FMP)' },
  { keys: ['r'],                description: 'Refresh current feed' },
  { keys: ['a'],                description: 'Add current symbol to watchlist' },
  { keys: ['s'],                description: 'Toggle auto-stream' },
  { keys: ['?'],                description: 'Show this help' },
];

/**
 * @param {{
 *   onClose: () => void,
 * }} props
 */
export function HelpOverlay({ onClose }) {
  // Clicking the backdrop closes
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className={s.help}
      onClick={handleBackdrop}
      aria-modal="true"
      role="dialog"
    >
      <div className={`${s.help__card} ${s['elevation-3']}`}>
        <div className={s.help__head}>
          <span className={s.mono}>KEYBOARD SHORTCUTS</span>
          <button className={s.iconbtn} onClick={onClose}>×</button>
        </div>

        <ul className={s.help__list}>
          {SHORTCUTS.map(({ keys, description }) => (
            <li key={description}>
              <span>
                {keys.map((k, i) => (
                  <kbd key={i} className={s.kbd}>{k}</kbd>
                ))}
              </span>
              <span>{description}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
