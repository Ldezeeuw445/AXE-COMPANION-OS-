/**
 * Shared broker types used by the broker hub and adapters.
 */

export type BrokerProvider = "alpaca" | "ibkr" | "mt5" | "demo";

export interface BrokerConnection {
  id: string;
  userId: string;
  provider: BrokerProvider;
  label: string;
  status: "connected" | "disconnected" | "error" | "pending";
  createdAt: string;
}

export interface BrokerAccount {
  id: string;
  connectionId: string;
  provider: BrokerProvider;
  accountNumber: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  isPaper: boolean;
  label?: string;
}

export interface BrokerPosition {
  id: string;
  accountId: string;
  symbol: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  openedAt: string;
}

export interface BrokerOrder {
  id: string;
  accountId: string;
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  status: "pending" | "filled" | "cancelled" | "rejected";
  createdAt: string;
  filledAt?: string;
}
