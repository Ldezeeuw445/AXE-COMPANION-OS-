/**
 * engine/types/account.ts
 * =======================
 * Account contract — UI-facing shape.
 * Supabase = user truth. UI always gets this.
 */

export interface AccountSummary {
  userId: string;
  balance: number;
  equity: number;
  marginUsed: number;
  marginAvailable: number;
  openPnl: number;
  closedPnl: number;
  currency: string;
  lastUpdated: string;
}

export interface Position {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  size: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  pnl: number;
  pnlPercent: number;
  margin: number;
  openedAt: string;
}

export interface WatchlistItem {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  high24h?: number;
  low24h?: number;
  alerts?: string[];
}
