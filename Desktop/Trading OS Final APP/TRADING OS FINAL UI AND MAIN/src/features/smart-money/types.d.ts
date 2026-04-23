/**
 * SmartMoney — signal engine that aggregates all Intel feeds into one
 * unified score + reason list per ticker.
 *
 * The data source returns RAW events from each channel. The engine in
 * ./engine/aggregator.js fuses them into Signals.
 *
 * Wire your real adapters to:
 *   - Politicians:       https://housestockwatcher.com / Quiver / FMP senate-disclosure
 *   - Insiders:          FMP /v4/insider-trading, Finnhub stock/insider-transactions
 *   - Whales (crypto):   Whale Alert, Arkham, Nansen, on-chain via Supabase
 *   - Dark Pool:         FMP (dark-pool endpoint in ultimate), Unusual Whales
 *   - Unusual Options:   Unusual Whales, CBOE, FMP options flow
 *   - Corporate Jets:    ADS-B Exchange via RapidAPI + your tail-number table
 *   - Vessels:           AIS, MarineTraffic, Kpler
 */

export type SignalChannel =
  | "politician"
  | "insider"
  | "whale"
  | "dark_pool"
  | "options"
  | "jet"
  | "vessel"
  | "news";

export type SignalDirection = "bullish" | "bearish" | "neutral";

export interface SignalEvent {
  id: string;
  channel: SignalChannel;
  symbol: string;                // uppercase ticker or crypto ticker
  direction: SignalDirection;
  notionalUsd?: number;          // dollar size if applicable
  headline: string;              // one-liner
  detail?: string;               // optional longer text
  at: number;                    // epoch ms
  weight?: number;               // 0..1 override; if absent, aggregator computes
  meta?: Record<string, unknown>;
}

export interface AggregatedSignal {
  symbol: string;
  score: number;                  // -100..+100, negative = bearish
  confidence: 1 | 2 | 3 | 4 | 5;  // how many distinct channels contribute
  direction: SignalDirection;
  channels: SignalChannel[];      // distinct channels backing the signal
  totalNotionalUsd: number;
  reasons: string[];              // human-readable bullets, newest first
  events: SignalEvent[];          // raw events used
  updatedAt: number;              // latest event at
}

export interface SmartMoneyDataSource {
  /**
   * Returns a snapshot of recent events across all channels.
   * Implementations can cache and throttle; the component refetches on
   * mount + every refreshMs.
   */
  listEvents(
    sinceMs?: number,
    signal?: AbortSignal
  ): Promise<SignalEvent[]>;
}

export interface AggregatorConfig {
  /** How much each channel weights into the final score (default below). */
  channelWeights?: Partial<Record<SignalChannel, number>>;
  /** Half-life in hours for time decay. Default 12h. */
  halfLifeHours?: number;
  /** Minimum notional to consider non-trivial (USD). Default 50k. */
  minNotionalUsd?: number;
  /** Max signals to return. Default 20. */
  maxResults?: number;
}
