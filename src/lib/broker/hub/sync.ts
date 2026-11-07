import type { SupabaseClient } from "@supabase/supabase-js";
import { syncWriteClient } from "@/lib/supabase/syncWriteClient";
import {
  accountConnectionToDbPatch,
  dbRowToAccountConnection,
  inferTradingMode,
  providerStatusToHubStatus,
  type BrokerAccountDbRow,
} from "./mappers";
import { catalogEntryForHubId, hubIdForProvider } from "./catalog";
import type { BrokerPermissionState } from "./contract";

/**
 * Sync hub columns on user_broker_accounts after MT5 connect/sync/disconnect.
 * Called from mt5Cloud actions — no frontend changes required.
 *
 * TOS-SEC-2: those actions pass the trader's own client, so the write here has
 * to elevate itself, or every connect breaks the day the UPDATE grant comes
 * off. The read stays on `supabase`: RLS returns nothing for someone else's
 * account, and then nothing is written. The elevated write filters on the
 * owner that read returned (accountWriteSurface.test.ts).
 */
export async function syncBrokerHubFromAccountRow(
  supabase: SupabaseClient,
  accountId: string,
): Promise<void> {
  try {
    const { data, error } = await supabase
    .from("user_broker_accounts")
    .select(
      "id,user_id,label,provider,connection_method,provider_status,last_sync_at,created_at,hub_broker_id,trading_mode,hub_status,hub_permissions,metadata,masked_login,mt5_server",
    )
    .eq("id", accountId)
    .maybeSingle();

  if (error || !data) return;

  const row = data as BrokerAccountDbRow;
  const hubBrokerId = row.hub_broker_id ?? hubIdForProvider(row.provider, row.connection_method);
  const mode = inferTradingMode(row);
  const status = providerStatusToHubStatus(row.provider_status);
  const catalog = catalogEntryForHubId(hubBrokerId);

  const permissions: BrokerPermissionState = {
    tradingEnabled:
      hubBrokerId === "axe-demo" ||
      (mode !== "readonly" && status === "connected"),
    readOnly: mode === "readonly",
    marketDataTier: catalog?.marketData.defaultTier ?? "realtime",
    grantedScopes:
      mode === "readonly"
        ? ["read_account", "read_positions", "read_orders", "market_data"]
        : [
            "read_account",
            "read_positions",
            "read_orders",
            "place_orders",
            "cancel_orders",
            "market_data",
            "streaming_quotes",
          ],
    deniedScopes: mode === "readonly" ? ["place_orders", "cancel_orders"] : [],
  };

  const connection = dbRowToAccountConnection({
    ...row,
    hub_broker_id: hubBrokerId,
    trading_mode: mode,
    hub_status: status,
    hub_permissions: permissions as unknown as Record<string, unknown>,
  });

  await syncWriteClient(supabase)
    .from("user_broker_accounts")
    .update(accountConnectionToDbPatch(connection))
    .eq("id", accountId)
    .eq("user_id", row.user_id);
  } catch {
    /* hub columns / tables may not be migrated yet */
  }
}
