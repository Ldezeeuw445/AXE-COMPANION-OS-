/**
 * News terminal DataSource — feeds the existing NewsTab UI via engineAdapter (`news()` + chart quotes).
 * Layout unchanged; only the data pipe is real.
 */
import type {
  DataSource,
  FetchFeedParams,
  FetchMiniParams,
  FetchQuoteParams,
  FetchTickerParams,
  SearchParams,
  NewsItem as FeedNewsItem,
  Quote,
  TickerItem,
  SymbolSuggestion,
} from '../features/news/types';
import type { NewsItem as LegacyNewsItem } from './engineAdapterLegacy';
import { news } from './engineAdapterLegacy';
import { getTradingAdapter } from './tradingAdapterSingleton';
import { DEFAULT_WATCHLIST, TRENDING_SYMBOLS } from '@/features/news/utils/constants';

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}

function parsePublishedMs(timestamp: string): number {
  const t = Date.parse(timestamp);
  if (Number.isFinite(t)) return t;
  const m = /(\d+)\s*min\s*ago/i.exec(timestamp);
  if (m) return Date.now() - Number(m[1]) * 60_000;
  return Date.now();
}

function tagsFromLegacy(n: LegacyNewsItem): string[] {
  const cat = (n.category || '').toUpperCase();
  if (cat.includes('EARN')) return ['EARNINGS'];
  if (cat.includes('CRYPTO') || cat.includes('BTC')) return ['BREAKING'];
  if (cat.includes('FOREX') || cat.includes('MACRO')) return ['BREAKING'];
  if (n.sentiment === 'bullish') return ['UPGRADE'];
  if (n.sentiment === 'bearish') return ['DOWNGRADE'];
  return ['BREAKING'];
}

function mapLegacyToFeedItem(n: LegacyNewsItem): FeedNewsItem {
  const symbols = (n.tickers || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  return {
    id: n.id,
    title: n.headline || '(no title)',
    text: n.summary,
    publisher: n.source,
    publishedAt: parsePublishedMs(n.timestamp),
    url: n.url,
    symbols: symbols.length ? symbols : [],
    tags: tagsFromLegacy(n),
  };
}

function chartSymbolForEngine(sym: string): string {
  const s = sym.trim();
  if (s.includes('/')) return s;
  if (/^[A-Z]{6}$/.test(s)) return `${s.slice(0, 3)}/${s.slice(3)}`;
  return s;
}

async function chartToQuote(symbol: string, signal?: AbortSignal): Promise<Quote | null> {
  throwIfAborted(signal);
  const adapter = getTradingAdapter();
  const sym = chartSymbolForEngine(symbol);
  let data;
  try {
    data = await adapter.getChart(sym, '1D', 40);
  } catch {
    const u = symbol.toUpperCase();
    return {
      symbol: u,
      name: u,
      price: 0,
      change: 0,
      changesPercentage: 0,
      dayLow: 0,
      dayHigh: 0,
      yearLow: 0,
      yearHigh: 0,
      open: 0,
      previousClose: 0,
      volume: 0,
      avgVolume: 0,
      marketCap: 0,
      timestamp: Date.now(),
    };
  }
  throwIfAborted(signal);
  const candles = Array.isArray(data?.candles) ? data.candles : [];
  if (candles.length === 0) {
    const u = symbol.toUpperCase();
    return {
      symbol: u,
      name: u,
      price: 0,
      change: 0,
      changesPercentage: 0,
      dayLow: 0,
      dayHigh: 0,
      yearLow: 0,
      yearHigh: 0,
      open: 0,
      previousClose: 0,
      volume: 0,
      avgVolume: 0,
      marketCap: 0,
      timestamp: Date.now(),
    };
  }
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2] ?? last;
  const price = Number(last.close);
  const prevClose = Number(prev.close ?? last.close);
  if (!Number.isFinite(price)) {
    const u = symbol.toUpperCase();
    return {
      symbol: u,
      name: u,
      price: 0,
      change: 0,
      changesPercentage: 0,
      dayLow: 0,
      dayHigh: 0,
      yearLow: 0,
      yearHigh: 0,
      open: 0,
      previousClose: 0,
      volume: 0,
      avgVolume: 0,
      marketCap: 0,
      timestamp: Date.now(),
    };
  }
  const change = price - prevClose;
  const changesPercentage = prevClose ? (change / prevClose) * 100 : 0;
  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const vols = candles.map((c) => Number(c.volume ?? 0));
  return {
    symbol: symbol.toUpperCase(),
    name: symbol,
    price,
    change,
    changesPercentage,
    dayLow: Math.min(...lows),
    dayHigh: Math.max(...highs),
    yearLow: Math.min(...lows),
    yearHigh: Math.max(...highs),
    open: Number(last.open),
    previousClose: prevClose,
    volume: vols.reduce((a, b) => a + b, 0),
    avgVolume: vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 0,
    marketCap: 0,
    timestamp: Date.now(),
  };
}

async function chartToTickerItem(symbol: string, signal?: AbortSignal): Promise<TickerItem | null> {
  const q = await chartToQuote(symbol, signal);
  if (!q) return null;
  return {
    symbol: q.symbol,
    price: q.price,
    change: q.change,
    changesPercentage: q.changesPercentage,
  };
}

export function createEngineNewsDataSource(): DataSource {
  return {
    async fetchFeed(params: FetchFeedParams): Promise<FeedNewsItem[]> {
      throwIfAborted(params.signal);
      const { feed, symbol, page, limit } = params;
      const want = Math.min(120, limit * (page + 1));
      const tickers =
        feed === 'stock' && symbol
          ? [symbol]
          : feed === 'articles' && symbol
            ? [symbol]
            : undefined;
      const raw = await news(tickers, { limit: want });
      throwIfAborted(params.signal);
      const mapped = raw.map(mapLegacyToFeedItem);
      mapped.sort((a, b) => b.publishedAt - a.publishedAt);
      return mapped.slice(page * limit, page * limit + limit);
    },

    async fetchMiniFeed(params: FetchMiniParams): Promise<FeedNewsItem[]> {
      throwIfAborted(params.signal);
      const raw = await news(undefined, { limit: params.limit });
      throwIfAborted(params.signal);
      return raw.map(mapLegacyToFeedItem);
    },

    async fetchQuote(params: FetchQuoteParams): Promise<Quote | null> {
      return chartToQuote(params.symbol, params.signal);
    },

    async fetchTicker(params: FetchTickerParams): Promise<TickerItem[]> {
      throwIfAborted(params.signal);
      const syms = (params.symbols || []).slice(0, 16);
      const out = await Promise.all(syms.map((s) => chartToTickerItem(s, params.signal)));
      return out.filter((x): x is TickerItem => x != null);
    },

    async searchSymbols(params: SearchParams): Promise<SymbolSuggestion[]> {
      throwIfAborted(params.signal);
      const q = params.query.trim().toUpperCase();
      if (!q) return [];
      const pool = [...new Set([...TRENDING_SYMBOLS, ...DEFAULT_WATCHLIST])];
      const hits = pool
        .filter((s) => s.toUpperCase().includes(q))
        .slice(0, params.limit)
        .map(
          (symbol): SymbolSuggestion => ({
            symbol,
            name: symbol,
            type: 'equity',
          }),
        );
      return hits;
    },
  };
}
