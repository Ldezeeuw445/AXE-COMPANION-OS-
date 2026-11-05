import type { BrokerApiAdapter, ConnectAccountResult, ConnectionDoctorResult } from "../contract";

function stubAdapter(brokerId: "alpaca-style" | "ibkr-style", label: string): BrokerApiAdapter {
  return {
    brokerId,
    async connect(): Promise<ConnectAccountResult> {
      return {
        success: false,
        error: `${label} connect is not enabled yet. Supabase schema and hub adapters are ready — flip broker_providers.enabled when the API adapter ships.`,
      };
    },
    async disconnect(): Promise<void> {
      /* no-op until live adapter */
    },
    async runDoctor(accountId: string): Promise<ConnectionDoctorResult> {
      return {
        accountId,
        ranAt: new Date().toISOString(),
        overallStatus: "skipped",
        checks: [
          {
            id: "stub",
            label: `${label} adapter`,
            status: "skipped",
            message: "Catalog and database ready; live API integration pending.",
          },
        ],
      };
    },
    async testCredentials() {
      return {
        valid: false,
        message: `${label} credential test not available yet.`,
      };
    },
  };
}

export const alpacaStubBrokerApi = stubAdapter("alpaca-style", "Alpaca");
export const ibkrStubBrokerApi = stubAdapter("ibkr-style", "Interactive Brokers");

export const axeDemoBrokerApi: BrokerApiAdapter = {
  brokerId: "axe-demo",
  async connect(): Promise<ConnectAccountResult> {
    return {
      success: false,
      error: "AXE Demo is auto-provisioned — no manual connect required.",
    };
  },
  async disconnect(): Promise<void> {},
  async runDoctor(accountId: string): Promise<ConnectionDoctorResult> {
    return {
      accountId,
      ranAt: new Date().toISOString(),
      overallStatus: "pass",
      checks: [
        {
          id: "demo",
          label: "Demo account",
          status: "pass",
          message: "Virtual paper account — always available",
        },
      ],
    };
  },
};
