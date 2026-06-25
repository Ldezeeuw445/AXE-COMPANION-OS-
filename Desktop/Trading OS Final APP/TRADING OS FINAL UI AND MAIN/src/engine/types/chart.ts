/**
 * engine/types/chart.ts
 * =====================
 * Chart contract — UI-facing shape.
 * No matter which provider (Polygon, Twelve Data, Yahoo Finance), UI always gets this.
 */

export interface Candle {
  time: string;        // ISO timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Populated by ChartService for observability (Engine Ops proof, logs). */
export interface ChartFetchDebugMeta {
  providersAttempted: string[];
  providerErrors: Record<string, string>;
  /** API keys present for chart providers (Polygon / TwelveData / FMP). */
  configured: { polygon: boolean; twelvedata: boolean; fmp: boolean };
  /** Yahoo in chart chain only when `ENABLE_YAHOO_CHART_FALLBACK` / `enableYahooChartFallback` is true. */
  yahooChartFallbackEnabled: boolean;
  /** Last symbol string sent to each provider id that was attempted */
  providerSymbol: Record<string, string>;
  finalProviderUsed: string | null;
  candleCount: number;
  /** Human-readable notes (e.g. yahoo skipped unhealthy) */
  notes?: string[];
}

export interface ChartData {
  symbol: string;
  timeframe: string;   // 1M, 5M, 1H, 4H, 1D, 1W, 1MO
  candles: Candle[];
  indicators?: Record<string, number[]>;  // RSI, MACD, etc.
  source?: string;     // Which provider served it (for debugging)
  debug?: ChartFetchDebugMeta;
}

export class ChartFetchError extends Error {
  readonly debug: ChartFetchDebugMeta;

  constructor(message: string, debug: ChartFetchDebugMeta) {
    super(message);
    this.name = 'ChartFetchError';
    this.debug = debug;
  }
}


export interface ChartFilter {
  symbol: string;
  timeframe: string;
  from?: string;       // ISO date
  to?: string;         // ISO date
  limit?: number;
}
