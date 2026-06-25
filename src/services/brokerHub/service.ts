/**
 * Broker Hub Service
 * 
 * Unified interface for managing Alpaca, IBKR, and MT5 accounts
 * Provides:
 * - Account listing and switching
 * - Position aggregation across brokers
 * - Order placement and tracking
 * - Real-time updates via WebSocket
 * - Health checks per broker
 */

import type { BrokerConnection, BrokerAccount, BrokerPosition, BrokerOrder } from '@/types/broker';

interface BrokerHubOptions {
  userId: string;
  onAccountsChanged?: (accounts: BrokerAccount[]) => void;
  onPositionsChanged?: (positions: BrokerPosition[]) => void;
}

/**
 * Broker Hub — manages all broker connections for a user
 */
export class BrokerHub {
  private userId: string;
  private connections: Map<string, BrokerConnection> = new Map();
  private onAccountsChanged?: (accounts: BrokerAccount[]) => void;
  private onPositionsChanged?: (positions: BrokerPosition[]) => void;

  constructor(options: BrokerHubOptions) {
    this.userId = options.userId;
    this.onAccountsChanged = options.onAccountsChanged;
    this.onPositionsChanged = options.onPositionsChanged;
  }

  /**
   * Load all broker connections for this user
   */
  async loadConnections(): Promise<BrokerConnection[]> {
    try {
      const response = await fetch(`/api/broker-hub/connections?userId=${this.userId}`);
      if (!response.ok) throw new Error(`Failed to load connections: ${response.status}`);

      const connections = await response.json() as BrokerConnection[];
      for (const conn of connections) {
        this.connections.set(conn.id, conn);
      }

      return connections;
    } catch (error) {
      console.error('[BrokerHub] Failed to load connections:', error);
      return [];
    }
  }

  /**
   * Get all accounts across all brokers
   */
  async getAccounts(): Promise<BrokerAccount[]> {
    try {
      const response = await fetch(`/api/broker-hub/accounts?userId=${this.userId}`);
      if (!response.ok) throw new Error(`Failed to fetch accounts: ${response.status}`);

      const accounts = await response.json() as BrokerAccount[];
      this.onAccountsChanged?.(accounts);
      return accounts;
    } catch (error) {
      console.error('[BrokerHub] Failed to get accounts:', error);
      return [];
    }
  }

  /**
   * Get all positions across all brokers
   */
  async getPositions(accountId?: string): Promise<BrokerPosition[]> {
    try {
      const query = new URLSearchParams({ userId: this.userId });
      if (accountId) query.append('accountId', accountId);

      const response = await fetch(`/api/broker-hub/positions?${query}`);
      if (!response.ok) throw new Error(`Failed to fetch positions: ${response.status}`);

      const positions = await response.json() as BrokerPosition[];
      this.onPositionsChanged?.(positions);
      return positions;
    } catch (error) {
      console.error('[BrokerHub] Failed to get positions:', error);
      return [];
    }
  }

  /**
   * Place an order on a specific broker
   */
  async placeOrder(order: {
    accountId: string;
    symbol: string;
    quantity: number;
    side: 'buy' | 'sell';
    type: 'market' | 'limit';
    limitPrice?: number;
    timeInForce?: string;
  }): Promise<BrokerOrder> {
    try {
      const response = await fetch('/api/broker-hub/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: this.userId, ...order }),
      });

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error.error || `Order placement failed: ${response.status}`);
      }

      return await response.json() as BrokerOrder;
    } catch (error) {
      console.error('[BrokerHub] Order placement failed:', error);
      throw error;
    }
  }

  /**
   * Get health status of all brokers
   */
  async getHealth(): Promise<Array<{ broker: string; status: 'healthy' | 'degraded' | 'offline'; latency_ms: number }>> {
    try {
      const response = await fetch(`/api/broker-hub/health?userId=${this.userId}`);
      if (!response.ok) throw new Error(`Failed to fetch health: ${response.status}`);

      return await response.json() as Array<{ broker: string; status: 'healthy' | 'degraded' | 'offline'; latency_ms: number }>;
    } catch (error) {
      console.error('[BrokerHub] Failed to get health:', error);
      return [];
    }
  }

  /**
   * Connect a new broker (OAuth flow or manual input)
   */
  async connectBroker(broker: 'alpaca' | 'ibkr' | 'mt5'): Promise<{ url: string } | { success: boolean }> {
    try {
      const response = await fetch(`/api/broker-hub/connect/${broker}?userId=${this.userId}`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error(`Connection failed: ${response.status}`);
      return await response.json() as { url: string } | { success: boolean };
    } catch (error) {
      console.error(`[BrokerHub] Failed to connect ${broker}:`, error);
      throw error;
    }
  }

  /**
   * Get recommended broker for a symbol/strategy
   */
  async getRecommendedBroker(symbol: string): Promise<string | null> {
    // Logic: Check which brokers have this symbol available
    // Prefer the one with lowest fees for this symbol class
    const accounts = await this.getAccounts();
    
    if (accounts.length === 0) return null;
    
    // TODO: Implement broker recommendation logic
    // For now, return the first account
    return accounts[0]?.id || null;
  }

  /**
   * Subscribe to real-time updates
   */
  subscribe(accountId: string): WebSocket | null {
    try {
      const ws = new WebSocket(
        `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/broker-hub/subscribe?accountId=${accountId}&userId=${this.userId}`
      );

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data) as { type: string; data?: unknown };
        if (data.type === 'positions_update') {
          this.onPositionsChanged?.(data.data as BrokerPosition[]);
        }
      };

      ws.onerror = (error) => {
        console.error('[BrokerHub] WebSocket error:', error);
      };

      return ws;
    } catch (error) {
      console.error('[BrokerHub] Failed to subscribe:', error);
      return null;
    }
  }
}

/**
 * Create a broker hub instance for a user
 */
export function createBrokerHub(userId: string, options?: Partial<BrokerHubOptions>): BrokerHub {
  return new BrokerHub({
    userId,
    ...options,
  });
}

// Export types
export type { BrokerHubOptions };
