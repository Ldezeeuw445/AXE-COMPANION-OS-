import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BrokerApiAdapter,
  ConnectAccountInput,
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
 */
export function createMt5BrokerApiAdapter(supabase: SupabaseClient): BrokerApiAdapter {
  return {
    brokerId: "mt5-style",
    async connect(_input: ConnectAccountInput): Promise<ConnectAccountResult> {
      return {
        success: false,
        error:
          "MT5 connect uses the Accounts wizard (MetaApi). Hub connect is reserved for Alpaca/IBKR.",
      };
    },
    async disconnect(accountId: string): Promise<void> {
      await supabase
        .from("user_broker_accounts")
        .update({ hub_status: "disconnected", provider_status: "disconnected" })
        .eq("id", accountId);
    },
    async runDoctor(accountId: string): Promise<ConnectionDoctorResult> {
      const { data, error } = await supabase
        .from("user_broker_accounts")
        .select(
          "id,user_id,label,provider,connection_method,provider_status,last_sync_at,created_at,hub_broker_id,trading_mode,hub_status,hub_permissions,metadata,masked_login,mt5_server",
        )
        .eq("id", accountId)
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
