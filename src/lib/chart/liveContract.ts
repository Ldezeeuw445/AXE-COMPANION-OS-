/**
 * Normalized realtime event contract shared between:
 *  - Cloudflare ChartLiveRoom Durable Object websocket
 *  - Next /api/chart/live SSE fallback
 *  - Frontend useLiveChart hook
 *
 * Keep payload shapes identical across transports so the client only has one parser.
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

export type LivePendingOrderPayload = {
  id: string;
  symbol: string;
  /** e.g. "buy_limit", "sell_limit", "buy_stop", "sell_stop" */
  type: string;
  side: "buy" | "sell" | string;
  volume: number;
  /** Trigger price for the pending order. */
  openPrice: number;
  currentPrice: number | null;
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
      type: "orders_update";
      userId?: string;
      accountId: string;
      total: number;
      onSymbol: LivePendingOrderPayload[];
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
  | { type: "error"; reason: string }
  | {
      /** High-impact market event pushed over the existing live channel.
       *  Fired when the backend detects a high-impact calendar event or
       *  breaking news during its periodic poll.  The client can surface
       *  this as a toast / banner without an extra WebSocket connection. */
      type: "market_alert";
      alertKind: "calendar" | "news";
      title: string;
      impact?: "high" | "medium";
      currency?: string | null;
      startsAt?: string | null;
      source?: string;
    };
