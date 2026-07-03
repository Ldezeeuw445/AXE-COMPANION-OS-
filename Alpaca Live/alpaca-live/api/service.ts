import type {
  BrokerAdapterRegistry,
  BrokerConnectionStore,
  BrokerEventStore,
  BrokerSecretStore,
} from "../broker-contract";
import type {
  BrokerConnection,
  BrokerOAuthExchangeInput,
  ConnectInput,
  PlaceOrderInput,
  ReplaceOrderInput,
} from "../types";

export class BrokerHubService {
  constructor(
    private readonly registry: BrokerAdapterRegistry,
    private readonly connectionStore: BrokerConnectionStore,
    private readonly eventStore: BrokerEventStore,
    private readonly secretStore: BrokerSecretStore
  ) {}

  async listConnections(userId: string) {
    return this.connectionStore.listUserConnections(userId);
  }

  async connect(input: ConnectInput) {
    const adapter = this.registry.get(input.broker);
    const connection = await adapter.connect(input);
    if (input.credentials) {
      await this.secretStore.saveCredentials(connection.id, input.credentials);
    }
    await this.connectionStore.saveConnection(connection);
    return connection;
  }

  async exchangeOAuthCode(input: BrokerOAuthExchangeInput) {
    const adapter = this.registry.get(input.broker);
    if (!adapter.exchangeOAuthCode) {
      throw new Error(`Broker ${adapter.broker} does not support OAuth code exchange.`);
    }
    const result = await adapter.exchangeOAuthCode(input);
    await this.secretStore.saveCredentials(result.connection.id, result.credentials);
    await this.connectionStore.saveConnection(result.connection);
    return result.connection;
  }

  async disconnect(connectionId: string) {
    const connection = await this.requireConnection(connectionId);
    const adapter = this.registry.get(connection.broker);
    await adapter.disconnect(connectionId);
    await this.secretStore.deleteCredentials(connectionId);
    await this.connectionStore.updateConnectionStatus(connectionId, "disconnected");
  }

  async refreshAuth(connectionId: string) {
    const adapter = await this.resolveAdapterForConnection(connectionId);
    if (!adapter.refreshAuth) {
      throw new Error(`Broker ${adapter.broker} does not support auth refresh.`);
    }
    await adapter.refreshAuth(connectionId);
    return this.requireConnection(connectionId);
  }

  async getAccounts(connectionId: string) {
    const adapter = await this.resolveAdapterForConnection(connectionId);
    return adapter.getAccounts(connectionId);
  }

  async getPositions(connectionId: string) {
    const adapter = await this.resolveAdapterForConnection(connectionId);
    return adapter.getPositions(connectionId);
  }

  async getOrders(connectionId: string, status?: string) {
    const adapter = await this.resolveAdapterForConnection(connectionId);
    return adapter.getOrders(connectionId, status);
  }

  async placeOrder(input: PlaceOrderInput) {
    const adapter = await this.resolveAdapterForConnection(input.connectionId);
    return adapter.placeOrder(input);
  }

  async replaceOrder(input: ReplaceOrderInput) {
    const adapter = await this.resolveAdapterForConnection(input.connectionId);
    if (!adapter.replaceOrder) {
      throw new Error(`Broker ${adapter.broker} does not support order replacement.`);
    }
    return adapter.replaceOrder(input);
  }

  async cancelOrder(connectionId: string, brokerOrderId: string) {
    const adapter = await this.resolveAdapterForConnection(connectionId);
    return adapter.cancelOrder(connectionId, brokerOrderId);
  }

  async getQuote(connectionId: string, symbol: string) {
    const adapter = await this.resolveAdapterForConnection(connectionId);
    return adapter.getQuote(symbol, connectionId);
  }

  async healthcheck(connectionId: string) {
    const adapter = await this.resolveAdapterForConnection(connectionId);
    return adapter.healthcheck(connectionId);
  }

  async listEvents(connectionId: string, limit?: number) {
    return this.eventStore.listByConnection(connectionId, limit);
  }

  private async resolveAdapterForConnection(connectionId: string) {
    const connection = await this.requireConnection(connectionId);
    return this.registry.get(connection.broker);
  }

  private async requireConnection(connectionId: string): Promise<BrokerConnection> {
    const connection = await this.connectionStore.getConnection(connectionId);
    if (!connection) {
      throw new Error(`Broker connection not found: ${connectionId}`);
    }
    return connection;
  }
}
