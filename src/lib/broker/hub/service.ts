/**
 * Broker Connection Hub — orchestration service (AXE Companion)
 *
 * Coordinates adapters from contract.ts. Production hosts inject Supabase +
 * broker-specific adapters via createAxeBrokerConnectionHub().
 *
 * @see https://github.com/Ldezeeuw445/broker-connection-hub
 */

import type {
  AccountConnection,
  BrokerAdapter,
  BrokerConnectionHubConfig,
  BrokerSymbolMapping,
  ConnectAccountInput,
  ConnectAccountResult,
  ConnectionDoctorResult,
  ConnectionStatus,
  UpdatePermissionsInput,
} from "./contract";

export class BrokerConnectionHubService {
  constructor(private readonly config: BrokerConnectionHubConfig) {}

  async listBrokerCatalog(): Promise<readonly BrokerAdapter[]> {
    return this.config.brokerCatalog;
  }

  async listAccounts(): Promise<AccountConnection[]> {
    const userId = await this.config.auth.getCurrentUserId();
    return this.config.database.listAccounts(userId);
  }

  async getAccount(accountId: string): Promise<AccountConnection | null> {
    return this.config.database.getAccount(accountId);
  }

  async connectAccount(input: ConnectAccountInput): Promise<ConnectAccountResult> {
    const adapter = this.config.brokers.get(input.brokerId);
    if (!adapter) {
      return { success: false, error: `Unknown broker: ${input.brokerId}` };
    }
    const result = await adapter.connect(input);
    if (result.success && result.account) {
      await this.config.secrets.storeCredentials(result.account.id, { ...input.credentials });
    }
    return result;
  }

  async disconnectAccount(accountId: string): Promise<void> {
    const account = await this.config.database.getAccount(accountId);
    if (!account) return;
    const adapter = this.config.brokers.get(account.brokerId);
    if (adapter) await adapter.disconnect(accountId);
    await this.config.secrets.deleteCredentials(accountId);
  }

  async runConnectionDoctor(accountId: string): Promise<ConnectionDoctorResult> {
    const account = await this.config.database.getAccount(accountId);
    if (!account) {
      return {
        accountId,
        ranAt: new Date().toISOString(),
        overallStatus: "fail",
        checks: [
          { id: "missing", label: "Account", status: "fail", message: "Account not found" },
        ],
      };
    }
    const adapter = this.config.brokers.get(account.brokerId);
    if (!adapter) {
      return {
        accountId,
        ranAt: new Date().toISOString(),
        overallStatus: "fail",
        checks: [
          {
            id: "adapter",
            label: "Broker adapter",
            status: "fail",
            message: `No adapter for ${account.brokerId}`,
          },
        ],
      };
    }
    return adapter.runDoctor(accountId);
  }

  async updatePermissions(input: UpdatePermissionsInput): Promise<AccountConnection | null> {
    const account = await this.config.database.getAccount(input.accountId);
    if (!account) return null;

    const permissions = { ...account.permissions };
    if (input.tradingEnabled !== undefined) permissions.tradingEnabled = input.tradingEnabled;
    if (input.readOnly !== undefined) permissions.readOnly = input.readOnly;
    if (input.marketDataTier !== undefined) permissions.marketDataTier = input.marketDataTier;

    const updated: AccountConnection = {
      ...account,
      permissions,
      mode: permissions.readOnly ? "readonly" : account.mode,
    };
    return this.config.database.saveAccount(updated);
  }

  async listSymbolMappings(accountId: string): Promise<BrokerSymbolMapping[]> {
    return this.config.database.listSymbolMappings(accountId);
  }

  async getCapabilityMatrixForUser(): Promise<{ broker: BrokerAdapter; accountCount: number }[]> {
    const accounts = await this.listAccounts();
    const counts = new Map<string, number>();
    for (const a of accounts) {
      counts.set(a.brokerId, (counts.get(a.brokerId) ?? 0) + 1);
    }
    return this.config.brokerCatalog.map((broker) => ({
      broker,
      accountCount: counts.get(broker.id) ?? 0,
    }));
  }

  subscribeAccountStatus(
    accountId: string,
    handler: (status: ConnectionStatus) => void,
  ): () => void {
    if (!this.config.realtime) return () => {};
    return this.config.realtime.subscribeAccountStatus(accountId, handler);
  }
}

export function createBrokerConnectionHub(
  config: BrokerConnectionHubConfig,
): BrokerConnectionHubService {
  return new BrokerConnectionHubService(config);
}
