import type {
  ExecutionBridgePayload,
  TerminalAlertPush,
  TerminalSyncState,
  TradingOSClient,
} from "@/lib/tradingos/types";

export class MockTradingOSClient implements TradingOSClient {
  async getConnectionState(): Promise<TerminalSyncState> {
    return {
      linked: true,
      lastHeartbeatAt: null,
      workspaceId: null,
    };
  }

  subscribeAlerts(handler: (a: TerminalAlertPush) => void): () => void {
    void handler;
    return () => {};
  }

  async submitApprovedExecution(
    payload: ExecutionBridgePayload
  ): Promise<void> {
    void payload;
    /* Phase 2: POST to TradingOS execution gateway */
  }
}

export const mockTradingOSClient = new MockTradingOSClient();
