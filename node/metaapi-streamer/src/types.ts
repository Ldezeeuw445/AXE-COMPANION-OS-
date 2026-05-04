/**
 * Local copy of the normalized chart event contract — kept in sync with
 * `cloudflare/chart-edge/src/liveContract.ts` and `src/lib/chart/liveContract.ts`.
 * One streamer + one worker + one frontend share this shape.
 */

export type LiveCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type LivePositionPayload = {
  id: string;
  symbol: string;
  side: "buy" | "sell" | string;
  volume: number;
  entryPrice: number | null;
  currentPrice: number | null;
  profit: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  openTime: string | null;
};

export type ChartLiveStatus = "live" | "delayed" | "reconnecting" | "offline" | "error";
export type ChartLiveSource = "metaapi_mt5";

export type ChartLiveEvent =
  | {
      type: "ready";
      userId?: string;
      accountId: string;
      displaySymbol: string;
      brokerSymbol: string;
      timeframe: string;
      source: ChartLiveSource;
    }
  | {
      type: "tick";
      userId?: string;
      accountId: string;
      displaySymbol: string;
      brokerSymbol: string;
      bid: number | null;
      ask: number | null;
      price: number | null;
      timestamp: string | null;
      source: ChartLiveSource;
    }
  | {
      type: "candle_update";
      userId?: string;
      accountId: string;
      displaySymbol: string;
      brokerSymbol: string;
      timeframe: string;
      candle: LiveCandle;
      patch: boolean;
      source: ChartLiveSource;
    }
  | {
      type: "positions_update";
      userId?: string;
      accountId: string;
      total: number;
      onSymbol: LivePositionPayload[];
      source: ChartLiveSource;
    }
  | {
      type: "live_status";
      status: ChartLiveStatus;
      reason?: string;
      lastTickAt?: string | null;
      lastCandleAt?: string | null;
    }
  | { type: "heartbeat" }
  | { type: "error"; reason: string };

export type Subscription = {
  userId: string;
  /** user_broker_accounts.id from Supabase */
  accountId: string;
  /** MetaApi trading account id */
  metaApiAccountId: string;
  /** Symbol shown in the UI (e.g. XAUUSD). */
  displaySymbol: string;
  /** Broker-resolved symbol used for actual MetaApi calls (e.g. XAUUSDm). */
  brokerSymbol: string;
  /** tf key m5..d1 */
  timeframe: string;
};

export function roomKey(s: Subscription): string {
  return `${s.userId}|${s.accountId}|${s.brokerSymbol}|${s.timeframe}`;
}

export const TF_MAP: Record<string, string> = {
  m5: "5m",
  m15: "15m",
  m30: "30m",
  h1: "1h",
  h4: "4h",
  d1: "1d",
};
