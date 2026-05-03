/**
 * Contract surface for future TradingOS terminal integration.
 * Phase 1: MockTradingOSClient simulates pushes; replace with WebSocket/REST later.
 */

export type TerminalAlertPush = {
  type: string;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
};

export type TerminalSyncState = {
  linked: boolean;
  lastHeartbeatAt: string | null;
  workspaceId: string | null;
};

export type ExecutionBridgePayload = {
  executionRequestId: string;
  /** Only sent after explicit user approval in Companion + terminal policy */
  approved: boolean;
};

export interface TradingOSClient {
  getConnectionState(): Promise<TerminalSyncState>;
  /** Subscribe in Phase 2; mock returns no-op */
  subscribeAlerts?(handler: (a: TerminalAlertPush) => void): () => void;
  /** Push approved execution back to terminal execution layer */
  submitApprovedExecution?(payload: ExecutionBridgePayload): Promise<void>;
}
