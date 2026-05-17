export type Mt5DoctorStepId =
  | "credentials_accepted"
  | "server_detected"
  | "metaapi_account_exists"
  | "deployment_state"
  | "terminal_connected"
  | "broker_connected"
  | "positions_readable"
  | "history_readable"
  | "live_prices_available"
  | "trading_permission"
  | "sync_freshness"
  | "known_failure_reason";

export type Mt5DoctorStepStatus = "pass" | "warn" | "fail" | "unknown" | "skipped";

export type Mt5DoctorOverallStatus =
  | "connected"
  | "syncing"
  | "reconnecting"
  | "needs_attention"
  | "read_only"
  | "server_issue"
  | "credentials_issue"
  | "provisioning_pending";

export type Mt5DoctorStep = {
  id: Mt5DoctorStepId;
  label: string;
  status: Mt5DoctorStepStatus;
  detail: string;
};

export type Mt5DoctorReport = {
  accountId: string;
  accountLabel: string;
  checkedAt: string;
  overallStatus: Mt5DoctorOverallStatus;
  headline: string;
  summary: string;
  providerStatus: string | null;
  deploymentState: string | null;
  terminalStatus: string | null;
  brokerServer: string | null;
  brokerName: string | null;
  loginMasked: string | null;
  liveTradingEnabled: boolean;
  lastSyncAt: string | null;
  lastSyncAgeMinutes: number | null;
  activeSymbols: string[];
  positionsCount: number | null;
  historyDealsChecked: number | null;
  priceSymbolChecked: string | null;
  knownFailureReason: string | null;
  steps: Mt5DoctorStep[];
};
