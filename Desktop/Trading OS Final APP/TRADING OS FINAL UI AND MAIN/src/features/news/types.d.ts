// ================================================================
// TradingOS News — public type contract
//
// Your engine is responsible for filtering and normalizing data.
// The module consumes the shapes defined here. Keep your engine
// output aligned with these interfaces and no internal normalization
// will happen inside the module.
// ================================================================

export type FeedKey = 'stock' | 'general' | 'press' | 'articles';

export type TagKey =
  | 'BREAKING'
  | 'EARNINGS'
  | 'UPGRADE'
  | 'DOWNGRADE'
  | 'M&A'
  | 'SEC'
  | 'GUIDANCE'
  | string;

export type FilterKey = 'ALL' | TagKey;

// ----------------------------------------------------------------
// News item — exactly what the module renders.
// Your engine must return items with this shape.
// ----------------------------------------------------------------
export interface NewsItem {
  /** Stable unique ID. Used for dedup + diff detection during streaming. */
  id: string;

  /** Headline. Plain text. */
  title: string;

  /** Short body / excerpt. Plain text. Optional. */
  text?: string;

  /** Publisher name (e.g. "Reuters", "FMP"). Optional. */
  publisher?: string;

  /** Publish timestamp (ms since epoch). Used for sorting + "time ago". */
  publishedAt: number;

  /** Absolute URL to original article. Optional. */
  url?: string;

  /** Absolute URL to preview image. Optional. */
  image?: string;

  /** Array of ticker symbols mentioned. Used for chips + symbol click. */
  symbols: string[];

  /** Pre-classified tags from your engine. Used for filter pills. */
  tags: TagKey[];

  /** Internal — set by the module when streaming detects a new item. */
  _isNew?: boolean;
}

// ----------------------------------------------------------------
// Quote — single symbol snapshot for QuoteCard.
// ----------------------------------------------------------------
export interface Quote {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changesPercentage: number;
  dayLow?: number;
  dayHigh?: number;
  yearLow?: number;
  yearHigh?: number;
  open?: number;
  previousClose?: number;
  volume?: number;
  avgVolume?: number;
  marketCap?: number;
  exchange?: string;
  timestamp?: number;
}

// ----------------------------------------------------------------
// TickerItem — one watchlist tile in the ticker tape.
// Map your quotes to this shape inside your dataSource.
// ----------------------------------------------------------------
export interface TickerItem {
  symbol: string;
  price: number;
  change: number;
  changesPercentage: number;
}

// ----------------------------------------------------------------
// SymbolSuggestion — autocomplete result.
// ----------------------------------------------------------------
export interface SymbolSuggestion {
  symbol: string;
  name?: string;
  exchange?: string;
  type?: string;
}

// ----------------------------------------------------------------
// Fetch parameters passed to dataSource methods.
// ----------------------------------------------------------------
export interface FetchFeedParams {
  feed: FeedKey;
  symbol?: string | null;
  page: number;
  limit: number;
  /** AbortSignal — your engine should forward this to fetch(). */
  signal?: AbortSignal;
}

export interface FetchMiniParams {
  kind: 'general' | 'press';
  limit: number;
  signal?: AbortSignal;
}

export interface FetchQuoteParams {
  symbol: string;
  signal?: AbortSignal;
}

export interface FetchTickerParams {
  symbols: string[];
  signal?: AbortSignal;
}

export interface SearchParams {
  query: string;
  limit: number;
  signal?: AbortSignal;
}

// ----------------------------------------------------------------
// DataSource — the ONLY way the module talks to your engine.
//
// All methods return Promises. Reject on failure — the module
// will surface errors to StatusBar and toasts.
//
// Your engine is free to cache, batch, debounce, and route under
// the hood. The module only cares about the shape of the result.
// ----------------------------------------------------------------
export interface DataSource {
  /** Main feed: stock/general/press/articles. */
  fetchFeed(params: FetchFeedParams): Promise<NewsItem[]>;

  /** Small sidebar feeds (MACRO + PRESS). */
  fetchMiniFeed(params: FetchMiniParams): Promise<NewsItem[]>;

  /** Single quote for the selected symbol. */
  fetchQuote(params: FetchQuoteParams): Promise<Quote | null>;

  /** Batch quote for the watchlist ticker tape. */
  fetchTicker(params: FetchTickerParams): Promise<TickerItem[]>;

  /** Autocomplete for the command bar. */
  searchSymbols(params: SearchParams): Promise<SymbolSuggestion[]>;
}

// ----------------------------------------------------------------
// NewsTab public props.
// ----------------------------------------------------------------
export interface NewsTabProps {
  /** Required. Your engine adapter. See DataSource interface. */
  dataSource: DataSource;

  /** Optional render-prop for your chart (e.g. TradingView Lightweight). */
  renderChart?: (ctx: { symbol: string | null }) => React.ReactNode;

  /** Fired when user selects a symbol. Sync with your global state. */
  onSymbolChange?: (symbol: string) => void;

  /** Initial selected symbol. */
  initialSymbol?: string | null;

  /** Initial watchlist override. Defaults to ['AAPL','TSLA','NVDA','SPY','QQQ']. */
  initialWatchlist?: string[];

  /** Initial feed key. Defaults to 'stock'. */
  initialFeed?: FeedKey;

  /** Hide the ChartCard entirely (useful if chart lives outside news tab). */
  hideChart?: boolean;

  /**
   * When true, NewsTab fills the parent (no max-width / centered margin).
   * Use inside the Trading OS News page shell so the terminal uses full center column width.
   */
  fillShell?: boolean;

  /** Custom class on root. */
  className?: string;
}

// ----------------------------------------------------------------
// NewsContext shape (internal — exposed for advanced consumers).
// ----------------------------------------------------------------
export interface NewsContextValue {
  dataSource: DataSource;
  symbol: string | null;
  setSymbol: (sym: string | null) => void;
  feed: FeedKey;
  setFeed: (f: FeedKey) => void;
  filter: FilterKey;
  setFilter: (f: FilterKey) => void;
  stream: boolean;
  setStream: (s: boolean) => void;
  status: 'idle' | 'loading' | 'live' | 'error';
  setStatus: (s: NewsContextValue['status']) => void;
  reqCount: number;
  errCount: number;
  incReq: () => void;
  incErr: () => void;
}
