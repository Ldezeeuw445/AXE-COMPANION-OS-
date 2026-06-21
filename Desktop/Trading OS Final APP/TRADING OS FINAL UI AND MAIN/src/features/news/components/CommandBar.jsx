// ================================================================
// CommandBar — autocomplete search input
// Pulls dataSource from NewsContext; calls useSymbolSearch.
// ================================================================

import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { NewsContext } from '../context/NewsContext.jsx';
import styles from '../styles/news.module.css';
import { cx } from '../utils/format.js';
import { useSymbolSearch } from '../hooks/useSymbolSearch.js';

export function CommandBar({ onSelectSymbol, searchInputRef, onHideSuggestions }) {
  const { dataSource } = useContext(NewsContext);
  const [query, setQuery]         = useState('');
  const [activeIdx, setActiveIdx] = useState(-1);
  const [open, setOpen]           = useState(false);
  const inputRef                  = useRef(null);
  const wrapRef                   = useRef(null);

  // Expose focus-handle to parent
  useEffect(() => {
    if (!searchInputRef) return;
    searchInputRef.current = {
      focus: () => {
        inputRef.current?.focus();
        inputRef.current?.select();
      },
      setValue: (v) => setQuery(v),
      blur: () => inputRef.current?.blur(),
    };
  }, [searchInputRef]);

  const { results } = useSymbolSearch({ dataSource, query, enabled: true });

  // Close suggestions on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    if (query && results.length) setOpen(true);
    if (!query) setOpen(false);
    setActiveIdx(-1);
  }, [query, results]);

  // Parent hook to imperatively close suggestions
  useEffect(() => {
    if (!onHideSuggestions) return;
    // no-op — parent reads ref it passed to useKeyboardNav; we listen via effect on `open`
  }, [onHideSuggestions]);

  const select = useCallback((sym) => {
    onSelectSymbol(sym);
    setQuery(sym);
    setOpen(false);
    inputRef.current?.blur();
  }, [onSelectSymbol]);

  const onKeyDown = (e) => {
    if (!open || !results.length) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = query.trim().toUpperCase();
        if (q) select(q);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0) select(results[activeIdx].symbol);
      else {
        const q = query.trim().toUpperCase();
        if (q) select(q);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <form
      className={styles.cmdbar}
      role="search"
      onSubmit={(e) => e.preventDefault()}
      ref={wrapRef}
    >
      <span className={styles.cmdbarPrefix} title="Focus with /">/</span>
      <input
        ref={inputRef}
        type="text"
        placeholder="Symbol (AAPL) · company name · keyword — press / to focus"
        spellCheck={false}
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query && results.length && setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && results.length > 0 && (
        <div className={cx(styles.suggestions, styles.elevation3)}>
          {results.map((it, i) => (
            <div
              key={it.symbol}
              className={cx(styles.suggestion, i === activeIdx && styles.suggestionActive)}
              onMouseDown={(e) => { e.preventDefault(); select(it.symbol); }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className={styles.suggestionSym}>{it.symbol}</span>
              <span className={styles.suggestionName}>{it.name || ''}</span>
              <span className={styles.suggestionExch}>{it.exchange || ''}</span>
            </div>
          ))}
        </div>
      )}
      <div className={styles.cmdbarHints}>
        <kbd>/</kbd><kbd>j</kbd><kbd>k</kbd><kbd>1-4</kbd><kbd>r</kbd>
      </div>
    </form>
  );
}
