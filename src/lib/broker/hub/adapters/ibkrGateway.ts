import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BrokerApiAdapter,
  ConnectAccountInput,
  ConnectAccountResult,
  ConnectionDoctorResult,
} from "../contract";

type IbkrMetadata = {
  ibkr?: {
    accountId?: string | null;
    username?: string | null;
    environment?: "paper" | "live";
    gatewayHost?: string | null;
    gatewayPort?: number | null;
    clientPortalBaseUrl?: string | null;
    executionEnabled?: boolean;
    liveAdapterReady?: boolean;
    readiness?: string;
    createdFrom?: string;
  };
  [key: string]: unknown;
};

type IbkrRow = {
  id: string;
  metadata: IbkrMetadata | null;
  connection_method: string | null;
};

function maskIbkrAccountId(accountId: string): string {
  const trimmed = accountId.trim().toUpperCase();
  if (!trimmed) return "U••••";
  if (trimmed.length <= 2) return `${trimmed[0] ?? "U"}••••`;
  return `${trimmed.slice(0, 1)}••••${trimmed.slice(-2)}`;
}

function normalizePortalUrl(host: string, port: number, clientPortalBaseUrl?: string | null): string {
  if (clientPortalBaseUrl?.trim()) return clientPortalBaseUrl.trim().replace(/\/+$/, "");
  return `https://${host}:${port}/v1/api`;
}

async function fetchIbkrAuthStatus(url: string): Promise<{ ok: boolean; message: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${url}/iserver/auth/status`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, message: String(payload.error ?? payload.message ?? res.statusText) };
    }
    return {
      ok: Boolean(payload.authenticated),
      message: String(payload.message ?? (payload.authenticated ? "Gateway reachable." : "Gateway reachable, session not authenticated.")),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Gateway unreachable.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function createIbkrBrokerApiAdapter(supabase: SupabaseClient): BrokerApiAdapter {
  return {
    brokerId: "ibkr-style",
    async connect(input: ConnectAccountInput): Promise<ConnectAccountResult> {
      const userId = input.credentials._userId?.trim();
      const accountId = (input.credentials.accountId ?? input.credentials.ibkrAccountId ?? "").trim().toUpperCase();
      const environment = input.credentials.environment === "live" ? "live" : "paper";
      const gatewayHost = (input.credentials.gatewayHost ?? "127.0.0.1").trim();
      const gatewayPort = Number(input.credentials.gatewayPort ?? (environment === "live" ? "7497" : "4002"));
      const clientPortalBaseUrl = (input.credentials.clientPortalBaseUrl ?? "").trim() || null;
      const username = (input.credentials.username ?? "").trim() || null;

      if (!userId) return { success: false, error: "Internal: user id required." };
      if (!accountId) return { success: false, error: "IBKR account id is required." };

      const connectionMethod = environment === "live" ? "ibkr_gateway_live" : "ibkr_gateway_paper";
      const now = new Date().toISOString();
      const metadata: IbkrMetadata = {
        ibkr: {
          accountId,
          username,
          environment,
          gatewayHost,
          gatewayPort: Number.isFinite(gatewayPort) ? gatewayPort : environment === "live" ? 7497 : 4002,
          clientPortalBaseUrl,
          executionEnabled: false,
          liveAdapterReady: process.env.ENABLE_IBKR_LIVE === "1",
          readiness: "staged_not_linked",
          createdFrom: "accounts_hub",
        },
      };

      const { data: existing, error: lookupError } = await supabase
        .from("user_broker_accounts")
        .select("id,metadata,connection_method")
        .eq("user_id", userId)
        .eq("provider", "ibkr")
        .eq("external_connection_id", accountId)
        .maybeSingle<IbkrRow>();

      if (lookupError) return { success: false, error: lookupError.message };

      let dbId: string;
      if (existing?.id) {
        const { error: updateError } = await supabase
          .from("user_broker_accounts")
          .update({
            label: input.label || "IBKR Account",
            connection_method: connectionMethod,
            provider_status: "pending_setup",
            hub_broker_id: "ibkr-style",
            trading_mode: input.mode === "readonly" ? "readonly" : environment,
            hub_status: "connecting",
            masked_login: maskIbkrAccountId(accountId),
            metadata: {
              ...(existing.metadata ?? {}),
              ...metadata,
            },
            last_sync_at: now,
          })
          .eq("id", existing.id);
        if (updateError) return { success: false, error: updateError.message };
        dbId = existing.id;
      } else {
        const { data: created, error: createError } = await supabase
          .from("user_broker_accounts")
          .insert({
            user_id: userId,
            provider: "ibkr",
            label: input.label || "IBKR Account",
            status: "active",
            connection_method: connectionMethod,
            external_connection_id: accountId,
            provider_status: "pending_setup",
            hub_broker_id: "ibkr-style",
            trading_mode: input.mode === "readonly" ? "readonly" : environment,
            hub_status: "connecting",
            masked_login: maskIbkrAccountId(accountId),
            metadata,
            last_sync_at: now,
          })
          .select("id")
          .single<{ id: string }>();
        if (createError || !created?.id) {
          return { success: false, error: createError?.message ?? "Could not create IBKR account." };
        }
        dbId = created.id;
      }

      const doctor = await this.runDoctor(dbId).catch(() => null);
      return {
        success: true,
        account: {
          id: dbId,
          userId,
          brokerId: "ibkr-style",
          label: input.label || "IBKR Account",
          status: doctor?.overallStatus === "pass" ? "connected" : "connecting",
          mode: input.mode,
          permissions: {
            tradingEnabled: false,
            readOnly: input.mode === "readonly",
            marketDataTier: "professional",
            grantedScopes: ["read_account", "read_positions", "read_orders", "market_data"],
            deniedScopes: ["place_orders", "cancel_orders"],
          },
          connectedAt: now,
          metadata: {
            readiness: doctor?.overallStatus === "pass" ? "gateway_verified" : "staged_not_linked",
          },
        },
      };
    },
    async disconnect(accountId: string): Promise<void> {
      await supabase
        .from("user_broker_accounts")
        .update({
          hub_status: "disconnected",
          provider_status: "disconnected",
        })
        .eq("id", accountId);
    },
    async runDoctor(accountId: string): Promise<ConnectionDoctorResult> {
      const ranAt = new Date().toISOString();
      const { data: row, error } = await supabase
        .from("user_broker_accounts")
        .select("id,metadata,connection_method")
        .eq("id", accountId)
        .maybeSingle<IbkrRow>();

      if (error || !row) {
        return {
          accountId,
          ranAt,
          overallStatus: "fail",
          checks: [{ id: "account", label: "IBKR account", status: "fail", message: "Account not found." }],
        };
      }

      const meta = row.metadata?.ibkr;
      if (!meta?.accountId) {
        return {
          accountId,
          ranAt,
          overallStatus: "fail",
          checks: [{ id: "metadata", label: "IBKR metadata", status: "fail", message: "Account metadata is incomplete." }],
        };
      }

      const url = normalizePortalUrl(
        meta.gatewayHost || "127.0.0.1",
        meta.gatewayPort || (row.connection_method === "ibkr_gateway_live" ? 7497 : 4002),
        meta.clientPortalBaseUrl,
      );
      const auth = await fetchIbkrAuthStatus(url);
      const checks = [
        {
          id: "staging",
          label: "Gateway profile",
          status: "pass" as const,
          message: `${meta.accountId} staged at ${meta.gatewayHost || "127.0.0.1"}:${meta.gatewayPort || "?"}`,
        },
        {
          id: "gateway",
          label: "Gateway / Client Portal",
          status: auth.ok ? ("pass" as const) : ("warn" as const),
          message: auth.message,
          remediation: auth.ok ? undefined : "Start IBKR Gateway or Client Portal and authenticate the session.",
        },
        {
          id: "execution",
          label: "Execution readiness",
          status: meta.executionEnabled ? ("pass" as const) : ("warn" as const),
          message: meta.executionEnabled
            ? "Execution enabled."
            : "Execution remains disabled until gateway readiness is confirmed.",
        },
      ];

      await supabase
        .from("user_broker_accounts")
        .update({
          provider_status: auth.ok ? "connected" : "gateway_offline",
          hub_status: auth.ok ? "connected" : "degraded",
          metadata: {
            ...(row.metadata ?? {}),
            ibkr: {
              ...meta,
              readiness: auth.ok ? "gateway_verified" : "staged_not_linked",
              liveAdapterReady: process.env.ENABLE_IBKR_LIVE === "1",
              lastDoctor: { ranAt, checks },
            },
          },
          last_sync_at: ranAt,
        })
        .eq("id", accountId);

      return {
        accountId,
        ranAt,
        overallStatus: auth.ok ? "pass" : "warn",
        checks,
      };
    },
    async testCredentials() {
      return {
        valid: true,
        message: "IBKR staged profiles use gateway health checks instead of credential validation.",
      };
    },
  };
}
