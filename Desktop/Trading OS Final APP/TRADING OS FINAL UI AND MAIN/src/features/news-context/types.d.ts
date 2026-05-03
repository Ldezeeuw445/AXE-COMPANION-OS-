// ================================================================
// News Context Panels — public type contract
//
// 4 symbol-aware panels that complement the News Terminal:
//   LEFT:  AnalystConsensus, PeersRelative
//   RIGHT: KeyLevels, SentimentShort
//
// Your engine implements ContextDataSource. The panels only render.
// ================================================================

// ----------------------------------------------------------------
// Analyst Consensus
// ----------------------------------------------------------------
export interface AnalystRatingBreakdown {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface PriceTarget {
  average: number;
  high: number;
  low: number;
  median?: number;
  numberOfAnalysts: number;
  currency?: string;
}

export interface AnalystAction {
  id: string;
  publishedAt: number;           // ms epoch
  firm: string;                  // "Morgan Stanley"
  action: 'upgrade' | 'downgrade' | 'initiate' | 'reiterate' | 'target_raised' | 'target_lowered';
  fromRating?: string;           // "Hold"
  toRating?: string;             // "Buy"
  fromTarget?: number;
  toTarget?: number;
  url?: string;
}

export interface AnalystConsensusData {
  symbol: string;
  currentPrice: number;
  ratings: AnalystRatingBreakdown;
  target: PriceTarget;
  recentActions: AnalystAction[];
  /** Optional: last 12 months average target, monthly */
  targetHistory?: { at: number; target: number }[];
}

// ----------------------------------------------------------------
// Peers & Relative Performance
// ----------------------------------------------------------------
export interface PeerPerformance {
  symbol: string;
  name?: string;
  changePercent: number;         // today's % change
  price: number;
  isSelected?: boolean;          // true for the active symbol
}

export interface RelativePerformanceData {
  symbol: string;                // the selected symbol
  peers: PeerPerformance[];      // includes the selected symbol itself
  sectorAverage?: number;        // sector avg % change
  sectorName?: string;           // "Technology"
  benchmark?: {
    symbol: string;              // "SPY" or "QQQ"
    changePercent: number;
  };
}

// ----------------------------------------------------------------
// Key Levels & Technical Snapshot
// ----------------------------------------------------------------
export interface MovingAverage {
  period: 20 | 50 | 200 | number;
  value: number;
  distancePercent: number;       // +/- % from current price
}

export interface TechnicalIndicator {
  name: 'RSI' | 'MACD' | 'Stoch' | string;
  value: number;
  signal?: 'bullish' | 'bearish' | 'neutral' | 'oversold' | 'overbought';
  /** Optional sub-values (e.g. MACD signal line, histogram) */
  extra?: Record<string, number>;
}

export interface KeyLevel {
  label: string;                 // "52W High", "ATH", "Pivot", "S1", "R1"
  price: number;
  kind: 'resistance' | 'support' | 'neutral';
  distancePercent?: number;      // +/- % from current price
}

export interface KeyLevelsData {
  symbol: string;
  currentPrice: number;
  week52High: number;
  week52Low: number;
  ath?: number;
  atl?: number;
  drawdownFromAth?: number;      // -20 means 20% below ATH
  movingAverages: MovingAverage[];
  indicators: TechnicalIndicator[];
  levels: KeyLevel[];
}

// ----------------------------------------------------------------
// Sentiment & Short Interest
// ----------------------------------------------------------------
export interface ShortInterestData {
  shortPercentOfFloat?: number;  // 0-100
  daysToCover?: number;
  borrowRate?: number;           // 0-100 annualized
  shortSharesOutstanding?: number;
  asOfDate?: number;             // ms epoch
}

export interface PutCallData {
  ratio: number;                 // today's put/call
  fiveDayTrend?: number[];       // last 5 days
  change?: number;               // vs. yesterday
}

export interface NewsSentiment {
  score: number;                 // -1 (bearish) to +1 (bullish)
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  windowHours: number;           // usually 168 (7 days) or 24
}

export interface SentimentShortData {
  symbol: string;
  shortInterest?: ShortInterestData;
  putCall?: PutCallData;
  newsSentiment?: NewsSentiment;
  /** Optional: derived score combining the above */
  squeezeScore?: number;         // 0-100
}

// ----------------------------------------------------------------
// Fetch parameters
// ----------------------------------------------------------------
export interface FetchBySymbolParams {
  symbol: string;
  signal?: AbortSignal;
}

// ----------------------------------------------------------------
// ContextDataSource — the adapter your engine must implement.
// All methods are async and receive AbortSignal. Return null if
// data is unavailable — the panel will render an empty state.
// ----------------------------------------------------------------
export interface ContextDataSource {
  fetchAnalystConsensus(params: FetchBySymbolParams): Promise<AnalystConsensusData | null>;
  fetchRelativePerformance(params: FetchBySymbolParams): Promise<RelativePerformanceData | null>;
  fetchKeyLevels(params: FetchBySymbolParams): Promise<KeyLevelsData | null>;
  fetchSentimentShort(params: FetchBySymbolParams): Promise<SentimentShortData | null>;
}

// ----------------------------------------------------------------
// Public component props
// ----------------------------------------------------------------
export interface ContextPanelsProps {
  /** Required. Adapter to your backend/engine. */
  dataSource: ContextDataSource;

  /** The currently selected symbol (sync with News tab). null = show empty states. */
  symbol: string | null;

  /** Auto-refresh interval in ms. Default: 60000 (1 minute). Set 0 to disable. */
  refreshInterval?: number;

  /** Which side to render — useful if you split left and right. */
  side?: 'left' | 'right' | 'both';

  /** Extra class on root container. */
  className?: string;
}

// Individual panel props (useful if you render them separately)
export interface PanelProps {
  dataSource: ContextDataSource;
  symbol: string | null;
  refreshInterval?: number;
  className?: string;
}
