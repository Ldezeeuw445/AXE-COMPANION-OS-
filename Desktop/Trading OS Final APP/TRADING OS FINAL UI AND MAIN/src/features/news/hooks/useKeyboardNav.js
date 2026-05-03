// ================================================================
// useKeyboardNav — global keyboard shortcuts for the news tab.
//
// Key map:
//   /           focus search
//   Esc         blur / close overlay
//   j, ArrowDown  next headline
//   k, ArrowUp    previous headline
//   Enter       open selected headline in new tab
//   c           send selected row symbol to chart
//   1..4        switch feed (stock/general/press/articles)
//   r           refresh
//   a           add current symbol to watchlist
//   s           toggle stream
//   ?           show help overlay
// ================================================================

import { useEffect } from 'react';

const isTypingInInput = (target) => {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
};

/**
 * Consolidated keyboard nav for NewsTab.
 */
export function useKeyboardNav({
  searchInputRef,
  hideSuggestions,
  itemCount,
  selectedIndex,
  setSelectedIndex,
  items,
  setFeed,
  reload,
  addCurrentToWatchlist,
  stream,
  setStream,
  showHelp,
  setShowHelp,
  selectSymbol,
  enabled = true,
}) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e) => {
      // Help overlay: Esc closes
      if (showHelp && e.key === 'Escape') {
        setShowHelp(false);
        return;
      }

      if (e.key === 'Escape') {
        searchInputRef?.current?.blur?.();
        hideSuggestions?.();
        return;
      }

      if (e.key === '/' && !isTypingInInput(e.target)) {
        e.preventDefault();
        searchInputRef?.current?.focus?.();
        return;
      }

      if (isTypingInInput(e.target)) return;
      if (e.shiftKey && e.key !== '?') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case 'j':
        case 'ArrowDown': {
          e.preventDefault();
          if (itemCount > 0) {
            setSelectedIndex(Math.min(selectedIndex + 1, itemCount - 1));
          }
          break;
        }
        case 'k':
        case 'ArrowUp': {
          e.preventDefault();
          if (itemCount > 0) {
            setSelectedIndex(Math.max(selectedIndex - 1, 0));
          }
          break;
        }
        case 'Enter': {
          const sel = items?.[selectedIndex];
          if (sel?.url) window.open(sel.url, '_blank', 'noopener');
          break;
        }
        case 'c': {
          const sel = items?.[selectedIndex];
          const sym = sel?.symbols?.[0];
          if (sym) selectSymbol?.(sym);
          break;
        }
        case '1': setFeed?.('stock');    break;
        case '2': setFeed?.('general');  break;
        case '3': setFeed?.('press');    break;
        case '4': setFeed?.('articles'); break;
        case 'r': reload?.();            break;
        case 'a': addCurrentToWatchlist?.(); break;
        case 's': setStream?.(!stream);  break;
        case '?': setShowHelp?.(true);   break;
        default: break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    enabled, showHelp,
    searchInputRef, hideSuggestions,
    itemCount, selectedIndex, setSelectedIndex, items,
    setFeed, reload, addCurrentToWatchlist, stream, setStream, setShowHelp, selectSymbol,
  ]);
}
