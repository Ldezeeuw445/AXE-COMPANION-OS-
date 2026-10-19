import type {
  BrokerAccount,
  BrokerCapabilities,
  BrokerConnection,
  BrokerEvent,
  BrokerHealthcheck,
  BrokerOrder,
  BrokerPosition,
  BrokerQuote,
  ConnectInput,
  BrokerOAuthExchangeInput,
  PlaceOrderInput,
  ReplaceOrderInput,
} from "./types";

export interface BrokerAdapter {
  readonly broker: "mt5" | "alpaca" | "ibkr";
  readonly capabilities: BrokerCapabilities;

  connect(input: ConnectInput): Promise<BrokerConnection>;
  disconnect(connectionId: string): Promise<void>;
  refreshAuth?(connectionId: string): Promise<void>;
  exchangeOAuthCode?(
    input: BrokerOAuthExchangeInput
  ): Promise<{ connection: BrokerConnection; credentials: Record<string, unknown> }>;

  getAccounts(connectionId: string): Promise<BrokerAccount[]>;
  getPositions(connectionId: string): Promise<BrokerPosition[]>;
  getOrders(connectionId: string, status?: string): Promise<BrokerOrder[]>;
  getQuote(symbol: string, connectionId: string): Promise<BrokerQuote>;

  getPortfolioHistory?(
    connectionId: string,
    params?: Record<string, unknown>
  ): Promise<unknown>;

  subscribeQuotes?(symbols: string[], connectionId: string): Promise<void>;
  subscribeOrderUpdates?(connectionId: string): Promise<void>;

  placeOrder(input: PlaceOrderInput): Promise<BrokerOrder>;
  cancelOrder(connectionId: string, brokerOrderId: string): Promise<void>;
  replaceOrder?(input: ReplaceOrderInput): Promise<BrokerOrder>;

  healthcheck(connectionId: string): Promise<BrokerHealthcheck>;
}

export interface BrokerAdapterRegistry {
  get(name: "mt5" | "alpaca" | "ibkr"): BrokerAdapter;
  list(): BrokerAdapter[];
}

export interface BrokerConnectionStore {
  saveConnection(connection: BrokerConnection): Promise<void>;
  getConnection(connectionId: string): Promise<BrokerConnection | null>;
  listUserConnections(userId: string): Promise<BrokerConnection[]>;
  updateConnectionStatus(connectionId: string, status: BrokerConnection["status"]): Promise<void>;
}

export interface BrokerEventStore {
  append(event: BrokerEvent): Promise<void>;
  listByConnection(connectionId: string, limit?: number): Promise<BrokerEvent[]>;
}

export interface BrokerSecretStore {
  saveCredentials(connectionId: string, credentials: Record<string, unknown>): Promise<void>;
  getCredentials<T extends Record<string, unknown>>(connectionId: string): Promise<T | null>;
  deleteCredentials(connectionId: string): Promise<void>;
}

export interface BrokerConnectionUpdater {
  saveConnection(connection: BrokerConnection): Promise<void>;
}
