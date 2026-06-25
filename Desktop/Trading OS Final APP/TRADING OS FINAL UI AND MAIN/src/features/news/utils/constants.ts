// ================================================================
// Constants — pure presentation module.
// Your engine is the data source; these only drive UI behavior.
// ================================================================

export const STORAGE = {
  watchlist: 'tradingos.watchlist',
  feed: 'tradingos.feed',
  stream: 'tradingos.stream',
  filter: 'tradingos.filter',
};

export const PAGE_SIZE = 40;
export const MINI_SIZE = 12;
export const STREAM_INTERVAL = 25_000;
export const TICKER_INTERVAL = 30_000;

export const DEFAULT_WATCHLIST = ['AAPL', 'TSLA', 'NVDA', 'SPY', 'QQQ'];

export const TRENDING_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'META', 'AMZN', 'GOOGL', 'BTCUSD'];

export const FEEDS = [
  { key: 'stock', label: 'Stock', shortcut: '1' },
  { key: 'general', label: 'Macro', shortcut: '2' },
  { key: 'press', label: 'Press', shortcut: '3' },
  { key: 'articles', label: 'FMP', shortcut: '4' },
];

export const FILTER_TAGS = ['ALL', 'BREAKING', 'EARNINGS', 'UPGRADE', 'DOWNGRADE', 'M&A', 'SEC', 'GUIDANCE'];
