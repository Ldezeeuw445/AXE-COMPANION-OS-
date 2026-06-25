/**
 * Messages from the live chart WebSocket (e.g. Cloudflare worker).
 * Initial OHLC history always comes from HTTP `getTradingAdapter().getChart`; WS carries ticks / open-bar updates only.
 */
export type LiveEngineMessage =
  | TickMessage
  | BarUpdateMessage
  | ProviderStatusMessage
  | HeartbeatMessage;

export type LiveEngineClientMessage = SubscribeMessage | UnsubscribeMessage | PingMessage;

export type ProviderStatus = 'healthy' | 'degraded' | 'cooldown' | 'down';

export type ProviderStatusReason =
  | 'rate_limited'
  | 'quota'
  | 'network'
  | 'provider_not_connected'
  | 'unknown';

export type TickMessage = {
  type: 'tick';
  ts: string;
  symbol: string;
  price: number;
  size?: number;
  bid?: number;
  ask?: number;
  provider?: string;
};

export type BarUpdateMessage = {
  type: 'bar_update';
  ts: string;
  symbol: string;
  timeframe: string;
  bar: {
    time: string; // candle open time ISO aligned to timeframe
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  };
  isFinal?: boolean;
  provider?: string;
};

export type ProviderStatusMessage = {
  type: 'provider_status';
  ts: string;
  provider: string;
  status: ProviderStatus;
  reason?: ProviderStatusReason;
  cooldownRemainingSec?: number;
  /** Echo: subscription symbol (UI canonical, e.g. XAU/USD). */
  symbol?: string;
  /** Echo: subscription timeframe (e.g. 1D). */
  timeframe?: string;
  /** Provider-native symbol used upstream (e.g. Polygon C:XAUUSD). */
  providerSymbol?: string;
};

export type HeartbeatMessage = {
  type: 'heartbeat';
  ts: string;
  serverTime: string;
};

export type SubscribeMessage = {
  type: 'subscribe';
  symbol: string;
  timeframe: string;
};

export type UnsubscribeMessage = {
  type: 'unsubscribe';
  symbol: string;
  timeframe: string;
};

export type PingMessage = {
  type: 'ping';
  ts?: string;
};

