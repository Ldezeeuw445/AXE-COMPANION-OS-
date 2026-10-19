export type BrokerName = "mt5" | "alpaca" | "ibkr";
export type BrokerEnvironment = "paper" | "live";
export type BrokerAuthMode = "api_keys" | "oauth" | "local_gateway";

export type AssetClass =
  | "stock"
  | "crypto"
  | "fx"
  | "future"
  | "option"
  | "cfd"
  | "index";

export type OrderSide = "buy" | "sell";
export type PositionSide = "long" | "short";
export type OrderType = "market" | "limit" | "stop" | "stop_limit" | "bracket";
export type TimeInForce = "day" | "gtc" | "ioc" | "fok";

export interface BrokerConnection {
  id: string;
  userId: string;
  broker: BrokerName;
  environment: BrokerEnvironment;
  authMode: BrokerAuthMode;
  status: "pending" | "connected" | "degraded" | "reauth_required" | "disconnected";
  accountRefs: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
}

export interface BrokerAccount {
  connectionId: string;
  brokerAccountId: string;
  displayName: string;
  currency: string;
  equity: number;
  cash: number;
  buyingPower?: number;
  marginUsed?: number;
  accountStatus: string;
  raw?: unknown;
}

export interface BrokerPosition {
  connectionId: string;
  brokerAccountId: string;
  symbol: string;
  assetClass: AssetClass;
  side: PositionSide;
  qty: number;
  avgEntryPrice: number;
  marketPrice?: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
  raw?: unknown;
}

export interface BrokerOrder {
  id: string;
  connectionId: string;
  brokerAccountId: string;
  clientOrderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  tif?: TimeInForce;
  qty: number;
  limitPrice?: number;
  stopPrice?: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  raw?: unknown;
}

export interface BrokerFill {
  orderId: string;
  brokerExecutionId: string;
  price: number;
  qty: number;
  side: OrderSide;
  timestamp: string;
  raw?: unknown;
}

export interface BrokerQuote {
  symbol: string;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
  last?: number;
  timestamp: string;
  source: string;
}

export interface BrokerCapabilities {
  paper: boolean;
  live: boolean;
  oauthConnect: boolean;
  marketData: boolean;
  orderPlacement: boolean;
  orderCancel: boolean;
  positions: boolean;
  portfolioHistory: boolean;
  accountUpdatesStream: boolean;
  marketDataStream: boolean;
  news: boolean;
  depthSource: "broker" | "synthetic" | "none";
}

export interface ConnectInput {
  userId: string;
  broker: BrokerName;
  environment: BrokerEnvironment;
  authMode: BrokerAuthMode;
  credentials?: {
    keyId?: string;
    secretKey?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    tokenType?: string;
    scopes?: string[];
  };
  metadata?: Record<string, unknown>;
}

export interface BrokerOAuthExchangeInput {
  userId: string;
  broker: BrokerName;
  environment: BrokerEnvironment;
  code: string;
  redirectUri?: string;
  codeVerifier?: string;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}

export interface PlaceOrderInput {
  connectionId: string;
  brokerAccountId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  tif?: TimeInForce;
  qty: number;
  limitPrice?: number;
  stopPrice?: number;
  extendedHours?: boolean;
  clientOrderId?: string;
  metadata?: Record<string, unknown>;
}

export interface ReplaceOrderInput {
  connectionId: string;
  brokerAccountId: string;
  brokerOrderId: string;
  qty?: number;
  limitPrice?: number;
  stopPrice?: number;
}

export interface BrokerHealthcheck {
  ok: boolean;
  trading: boolean;
  marketData: boolean;
  authFresh: boolean;
  message?: string;
}

export type BrokerEventType =
  | "broker.connection.connected"
  | "broker.connection.degraded"
  | "broker.account.updated"
  | "broker.position.updated"
  | "broker.order.accepted"
  | "broker.order.filled"
  | "broker.order.canceled"
  | "broker.quote.updated"
  | "broker.news.received";

export interface BrokerEvent<T = unknown> {
  type: BrokerEventType;
  connectionId: string;
  broker: BrokerName;
  environment: BrokerEnvironment;
  at: string;
  payload: T;
}
