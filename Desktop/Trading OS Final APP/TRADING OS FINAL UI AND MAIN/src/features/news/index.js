// ================================================================
// TradingOS · News — public barrel export
// ================================================================

export { NewsTab } from './NewsTab.jsx';

// Lower-level access
export { NewsProvider, NewsContext } from './context/NewsContext.jsx';

// Hooks (useful if you want to compose your own layout)
export { useNewsFeed }    from './hooks/useNewsFeed.js';
export { useQuote, useFmpQuote } from './hooks/useFmpQuote.js';
export { useTicker }      from './hooks/useTicker.js';
export { useMiniFeed }    from './hooks/useMiniFeed.js';
export { useWatchlist }   from './hooks/useWatchlist.js';
export { useKeyboardNav } from './hooks/useKeyboardNav.js';
export { useSymbolSearch } from './hooks/useSymbolSearch.js';

// Format helpers
export { fmtNum, fmtPrice, fmtPct, hhmm, ago, cx } from './utils/format.js';

// Constants
export {
  PAGE_SIZE, MINI_SIZE, STREAM_INTERVAL, TICKER_INTERVAL,
  DEFAULT_WATCHLIST, TRENDING_SYMBOLS, FEEDS, FILTER_TAGS,
} from './utils/constants';
