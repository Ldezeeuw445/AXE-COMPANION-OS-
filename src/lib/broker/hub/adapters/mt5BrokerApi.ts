import type { SupabaseClient } from "@supabase/supabase-js";
import { syncWriteClient } from "@/lib/supabase/syncWriteClient";
import type {
  BrokerApiAdapter,
  ConnectAccountResult,
  ConnectionDoctorResult,
} from "../contract";
import {
  dbRowToAccountConnection,
  doctorFromMetadata,
  overallDoctorStatus,
  type BrokerAccountDbRow,
} from "../mappers";

/**
 * MT5 accounts use the existing MetaApi connect flow (AccountsScreen wizard).
 * This adapter exposes doctor + read paths via the hub contract.
 *
 * Bound to one owner: `accountId` comes from a request body, so every
 * statement filters `user_id` as well as `id` rather than leaving ownership to
 * RLS (TOS-SEC-2 — see `brokerAdapterScope.test.ts`).
 */
export function createMt5BrokerApiAdapter(supabase: SupabaseClient, userId: string): BrokerApiAdapter {
  return {
    brokerId: "mt5-style",
    async connect(): Promise<ConnectAccountResult> {
      return {
        success: false,
        error:
          "MT5 connect uses the Accounts wizard (MetaApi). Hub connect is reserved for Alpaca/IBKR.",
      };
    },
    async disconnect(accountId: string): Promise<void> {
      // Ownership on the trader's own client, then the status write elevated so
      // it survives the UPDATE revoke (TOS-SEC-2, see syncWriteClient).
      const { data: account } = await supabase
        .from("user_broker_accounts")
        .select("id")
        .eq("id", accountId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!account) return;

      await syncWriteClient(supabase)
        .from("user_broker_accounts")
        .update({ hub_status: "disconnected", provider_status: "disconnected" })
        .eq("id", accountId)
        .eq("user_id", userId);
    },
    async runDoctor(accountId: string): Promise<ConnectionDoctorResult> {
      const { data, error } = await supabase
        .from("user_broker_accounts")
        .select(
          "id,user_id,label,provider,connection_method,provider_status,last_sync_at,created_at,hub_broker_id,trading_mode,hub_status,hub_permissions,metadata,masked_login,mt5_server",
        )
        .eq("id", accountId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !data) {
        return {
          accountId,
          ranAt: new Date().toISOString(),
          overallStatus: "fail",
          checks: [{ id: "account", label: "Account", status: "fail", message: "Not found" }],
        };
      }

      const meta = (data as BrokerAccountDbRow).metadata ?? {};
      const checks = doctorFromMetadata(accountId, meta);

      if (checks.length === 0) {
        const acct = dbRowToAccountConnection(data as BrokerAccountDbRow);
        checks.push({
          id: "status",
          label: "Connection status",
          status: acct.status === "connected" ? "pass" : acct.status === "error" ? "fail" : "warn",
          message: `Provider status: ${data.provider_status ?? "unknown"}`,
        });
      }

      return {
        accountId,
        ranAt: new Date().toISOString(),
        overallStatus: overallDoctorStatus(checks),
        checks,
      };
    },
  };
}
