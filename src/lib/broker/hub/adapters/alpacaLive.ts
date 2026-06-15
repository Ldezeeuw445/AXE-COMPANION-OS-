import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BrokerApiAdapter,
  ConnectAccountInput,
  ConnectAccountResult,
  ConnectionDoctorResult,
} from "../contract";
import { ensureAlpacaPaperAccount } from "@/lib/alpaca/provision";
import { getAlpacaPaperConfig, isAlpacaConfigured } from "@/lib/alpaca/env";
import { getAlpacaAccount } from "@/lib/alpaca/client";
import { resetAlpacaPaperTrading } from "@/lib/alpaca/reset";

/**
 * Alpaca paper adapter — platform-managed keys in server env for Phase 1.
 * Users tap "Enable Alpaca Paper" (no credentials). Phase 2 adds BYO keys
 * or Alpaca Broker API sub-accounts.
 */
export function createAlpacaBrokerApiAdapter(supabase: SupabaseClient): BrokerApiAdapter {
  return {
    brokerId: "alpaca-style",
    async connect(input: ConnectAccountInput): Promise<ConnectAccountResult> {
      if (input.mode !== "paper" && input.mode !== "readonly") {
        return { success: false, error: "Alpaca adapter currently supports paper mode only." };
      }

      const userId = input.credentials._userId?.trim();
      if (!userId) {
        return { success: false, error: "Internal: user id required for Alpaca provision." };
      }

      const result = await ensureAlpacaPaperAccount(supabase, userId);
      if (!result.ok) {
        return { success: false, error: result.message };
      }

      return {
        success: true,
        account: {
          id: result.accountId,
          userId,
          brokerId: "alpaca-style",
          label: input.label || "AXE Alpaca Paper",
          status: "connected",
          mode: "paper",
          permissions: {
            tradingEnabled: true,
            readOnly: input.mode === "readonly",
            marketDataTier: "realtime",
            grantedScopes: ["read_account", "read_positions", "read_orders", "place_orders", "market_data"],
            deniedScopes: [],
          },
          connectedAt: new Date().toISOString(),
          metadata: { source: "alpaca-style" },
        },
      };
    },
    async disconnect(accountId: string): Promise<void> {
      await supabase
        .from("user_broker_accounts")
        .update({ hub_status: "disconnected", provider_status: "disconnected" })
        .eq("id", accountId);
    },
    async runDoctor(accountId: string): Promise<ConnectionDoctorResult> {
      const ranAt = new Date().toISOString();
      if (!isAlpacaConfigured()) {
        return {
          accountId,
          ranAt,
          overallStatus: "fail",
          checks: [
            {
              id: "env",
              label: "Server credentials",
              status: "fail",
              message: "ALPACA_PAPER_API_KEY_ID / SECRET not set.",
              remediation: "Add Alpaca paper keys to Railway/Vercel env.",
            },
          ],
        };
      }

      const { data: row } = await supabase
        .from("user_broker_accounts")
        .select("id,connection_method,external_connection_id")
        .eq("id", accountId)
        .maybeSingle();

      if (!row || row.connection_method !== "cloud_alpaca") {
        return {
          accountId,
          ranAt,
          overallStatus: "fail",
          checks: [{ id: "account", label: "Account", status: "fail", message: "Not an Alpaca paper account." }],
        };
      }

      const config = getAlpacaPaperConfig()!;
      const started = Date.now();
      try {
        const acct = await getAlpacaAccount(config);
        return {
          accountId,
          ranAt,
          overallStatus: acct.status === "ACTIVE" ? "pass" : "warn",
          latencyMs: Date.now() - started,
          checks: [
            {
              id: "account",
              label: "Alpaca paper account",
              status: acct.status === "ACTIVE" ? "pass" : "warn",
              message: `Status ${acct.status} · equity $${Number(acct.equity).toLocaleString()}`,
            },
            {
              id: "trading",
              label: "Trading",
              status: acct.trading_blocked ? "fail" : "pass",
              message: acct.trading_blocked ? "Trading blocked on Alpaca side." : "Trading enabled.",
            },
          ],
        };
      } catch (error) {
        return {
          accountId,
          ranAt,
          overallStatus: "fail",
          latencyMs: Date.now() - started,
          checks: [
            {
              id: "reachability",
              label: "Alpaca API",
              status: "fail",
              message: error instanceof Error ? error.message : "Unreachable",
            },
          ],
        };
      }
    },
    async testCredentials(): Promise<{ valid: boolean; message?: string }> {
      if (!isAlpacaConfigured()) {
        return { valid: false, message: "Alpaca paper env vars not configured." };
      }
      try {
        await getAlpacaAccount(getAlpacaPaperConfig()!);
        return { valid: true, message: "Alpaca paper API reachable." };
      } catch (error) {
        return {
          valid: false,
          message: error instanceof Error ? error.message : "Alpaca credential test failed.",
        };
      }
    },
  };
}

export { resetAlpacaPaperTrading };
