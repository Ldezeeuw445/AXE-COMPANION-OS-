/**
 * Maps Supabase user_broker_accounts ↔ Broker Connection Hub contract types.
 */
import type {
  AccountConnection,
  BrokerPermissionState,
  ConnectionStatus,
  DoctorCheck,
  DoctorCheckStatus,
  TradingMode,
} from "./contract";
import { catalogEntryForHubId, hubIdForProvider } from "./catalog";

export type BrokerAccountDbRow = {
  id: string;
  user_id: string;
  label: string;
  provider: string;
  status?: string | null;
  connection_method?: string | null;
  provider_status?: string | null;
  last_sync_at?: string | null;
  created_at?: string | null;
  hub_broker_id?: string | null;
  trading_mode?: string | null;
  hub_status?: string | null;
  hub_permissions?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  masked_login?: string | null;
  mt5_server?: string | null;
};

const READ_SCOPES = [
  "read_account",
  "read_positions",
  "read_orders",
  "market_data",
] as const;

const TRADE_SCOPES = [
  "read_account",
  "read_positions",
  "read_orders",
  "place_orders",
  "cancel_orders",
  "market_data",
  "streaming_quotes",
] as const;

export function providerStatusToHubStatus(providerStatus: string | null | undefined): ConnectionStatus {
  const s = (providerStatus ?? "").toLowerCase();
  if (s === "connected" || s === "provisioned") return "connected";
  if (s === "provisioning" || s === "connecting" || s === "syncing" || s === "recovering") {
    return "connecting";
  }
  if (s === "disconnected" || s === "orphaned") return "disconnected";
  if (s === "sync_failed" || s === "recovery_failed" || s === "invalid_credentials" || s === "failed") {
    return "error";
  }
  if (s === "degraded") return "degraded";
  return "connecting";
}

function defaultPermissions(mode: TradingMode, hubBrokerId: string): BrokerPermissionState {
  const catalog = catalogEntryForHubId(hubBrokerId);
  const tier = catalog?.marketData.defaultTier ?? "realtime";
  const readOnly = mode === "readonly";
  const tradingEnabled = mode !== "readonly" && mode !== "paper" ? true : mode === "paper";

  return {
    tradingEnabled: hubBrokerId === "axe-demo" ? true : tradingEnabled && !readOnly,
    readOnly,
    marketDataTier: tier,
    grantedScopes: readOnly ? [...READ_SCOPES] : [...TRADE_SCOPES],
    deniedScopes: readOnly ? ["place_orders", "cancel_orders"] : [],
  };
}

function parseHubPermissions(raw: unknown, mode: TradingMode, hubBrokerId: string): BrokerPermissionState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaultPermissions(mode, hubBrokerId);
  }
  const r = raw as Record<string, unknown>;
  const base = defaultPermissions(mode, hubBrokerId);
  return {
    tradingEnabled: typeof r.tradingEnabled === "boolean" ? r.tradingEnabled : base.tradingEnabled,
    readOnly: typeof r.readOnly === "boolean" ? r.readOnly : base.readOnly,
    marketDataTier:
      typeof r.marketDataTier === "string"
        ? (r.marketDataTier as BrokerPermissionState["marketDataTier"])
        : base.marketDataTier,
    grantedScopes: Array.isArray(r.grantedScopes)
      ? (r.grantedScopes as BrokerPermissionState["grantedScopes"])
      : base.grantedScopes,
    deniedScopes: Array.isArray(r.deniedScopes)
      ? (r.deniedScopes as BrokerPermissionState["deniedScopes"])
      : base.deniedScopes,
    expiresAt: typeof r.expiresAt === "string" ? r.expiresAt : undefined,
  };
}

export function inferTradingMode(row: BrokerAccountDbRow): TradingMode {
  if (row.trading_mode === "paper" || row.trading_mode === "live" || row.trading_mode === "readonly") {
    return row.trading_mode;
  }
  if (row.provider === "demo" || row.connection_method === "demo_paper") return "paper";
  const meta = row.metadata ?? {};
  if (meta.passwordType === "investor") return "readonly";
  return "live";
}

export function dbRowToAccountConnection(row: BrokerAccountDbRow): AccountConnection {
  const hubBrokerId = row.hub_broker_id ?? hubIdForProvider(row.provider, row.connection_method);
  const mode = inferTradingMode(row);
  const status =
    (row.hub_status as ConnectionStatus | null) ??
    providerStatusToHubStatus(row.provider_status);
  const meta = row.metadata ?? {};

  const metadata: Record<string, string> = {};
  if (row.masked_login) metadata.login = row.masked_login;
  if (row.mt5_server) metadata.server = row.mt5_server;
  if (typeof meta.metaapiRegion === "string") metadata.region = meta.metaapiRegion;
  if (typeof meta.passwordType === "string") metadata.passwordType = meta.passwordType;

  return {
    id: row.id,
    userId: row.user_id,
    brokerId: hubBrokerId,
    label: row.label,
    status,
    mode,
    permissions: parseHubPermissions(row.hub_permissions, mode, hubBrokerId),
    connectedAt: row.created_at ?? undefined,
    lastSyncAt: row.last_sync_at ?? undefined,
    lastError: typeof meta.lastError === "string" ? meta.lastError : undefined,
    metadata,
  };
}

export function accountConnectionToDbPatch(
  account: AccountConnection,
): Record<string, unknown> {
  return {
    hub_broker_id: account.brokerId,
    trading_mode: account.mode,
    hub_status: account.status,
    hub_permissions: account.permissions,
  };
}

export function doctorFromMetadata(
  accountId: string,
  metadata: Record<string, unknown> | null | undefined,
): DoctorCheck[] {
  const lastDoctor = metadata?.lastDoctor;
  if (!lastDoctor || typeof lastDoctor !== "object" || Array.isArray(lastDoctor)) return [];
  const checks = (lastDoctor as { checks?: unknown }).checks;
  if (!Array.isArray(checks)) return [];
  return checks
    .map((c): DoctorCheck | null => {
      if (!c || typeof c !== "object") return null;
      const r = c as Record<string, unknown>;
      const status = String(r.status ?? "skipped") as DoctorCheckStatus;
      return {
        id: String(r.id ?? "check"),
        label: String(r.label ?? "Check"),
        status,
        message: String(r.message ?? ""),
        remediation: typeof r.remediation === "string" ? r.remediation : undefined,
      };
    })
    .filter((x): x is DoctorCheck => x != null);
}

export function overallDoctorStatus(checks: DoctorCheck[]): DoctorCheckStatus {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  if (checks.length === 0) return "skipped";
  return "pass";
}
