import type { SupabaseClient } from "@supabase/supabase-js";
import { getAlpacaPaperConfig, isAlpacaConfigured } from "@/lib/alpaca/env";
import { getAlpacaAccount } from "@/lib/alpaca/client";
import { ALPACA_CONNECTION_METHOD, ALPACA_PROVIDER } from "@/lib/broker/accountKind";
import { sessionIsUser, syncWriteClient } from "@/lib/supabase/syncWriteClient";

export { ALPACA_CONNECTION_METHOD, ALPACA_PROVIDER, isAlpacaAccount } from "@/lib/broker/accountKind";

export type AlpacaProvisionResult =
  | { ok: true; accountId: string; created: boolean }
  | { ok: false; code: string; message: string };

/**
 * Ensure the signed-in user has an AXE-managed Alpaca paper broker row.
 *
 * Phase 1 uses platform paper API keys (server env). Per-user isolation is
 * tracked via client_order_id prefixes and Supabase account rows. Phase 2
 * can swap in Alpaca Broker API sub-accounts without changing the UI contract.
 */
export async function ensureAlpacaPaperAccount(
  supabase: SupabaseClient,
  userId: string,
): Promise<AlpacaProvisionResult> {
  if (!isAlpacaConfigured()) {
    return {
      ok: false,
      code: "alpaca_not_configured",
      message: "Add ALPACA_PAPER_API_KEY_ID and ALPACA_PAPER_API_SECRET_KEY on the server.",
    };
  }

  const config = getAlpacaPaperConfig()!;

  const { data: existing, error: existingErr } = await supabase
    .from("user_broker_accounts")
    .select("id,external_connection_id,metadata")
    .eq("user_id", userId)
    .eq("connection_method", ALPACA_CONNECTION_METHOD)
    .maybeSingle();

  if (existingErr) {
    return { ok: false, code: "lookup_failed", message: existingErr.message };
  }

  let alpacaAccountId = existing?.external_connection_id ?? null;
  let accountNumber: string | null = null;
  let equity = 100_000;
  let buyingPower = 100_000;

  try {
    const remote = await getAlpacaAccount(config);
    alpacaAccountId = remote.id;
    accountNumber = remote.account_number;
    equity = Number(remote.equity) || equity;
    buyingPower = Number(remote.buying_power) || buyingPower;
  } catch (error) {
    return {
      ok: false,
      code: "alpaca_unreachable",
      message: error instanceof Error ? error.message : "Could not reach Alpaca paper API.",
    };
  }

  const now = new Date().toISOString();
  const metadata = {
    alpaca: true,
    paper: true,
    platform_managed: true,
    account_number: accountNumber,
    equity,
    buying_power: buyingPower,
    client_order_prefix: `axe-${userId.slice(0, 8)}`,
    provisioned_at: now,
  };

  const previousMeta =
    existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? (existing.metadata as Record<string, unknown>)
      : {};

  // Every column below is server-set (connected status, the Alpaca account
  // summary), so both writes go out elevated and the trader's own grants are
  // not what provisions the row (TOS-SEC-2). Ownership: the update targets the
  // row the RLS-scoped lookup above returned and filters user_id; the insert
  // has no row to read, so the session must be this user.
  //
  // Metadata is a shared jsonb blob: trading rules, account size, and Trading
  // OS keys (`tosProgramId` / `tosAssignment` / `tosMaxRiskPerTradePercent`)
  // live on the same row. Replacing the object with only Alpaca-owned keys
  // would wipe them on every accounts-page load / provision refresh.
  if (existing?.id) {
    await syncWriteClient(supabase)
      .from("user_broker_accounts")
      .update({
        external_connection_id: alpacaAccountId,
        provider_status: "connected",
        hub_broker_id: "alpaca-style",
        trading_mode: "paper",
        hub_status: "connected",
        last_sync_at: now,
        metadata: { ...previousMeta, ...metadata },
      })
      .eq("id", existing.id)
      .eq("user_id", userId);

    return { ok: true, accountId: existing.id, created: false };
  }

  if (!(await sessionIsUser(supabase, userId))) {
    return { ok: false, code: "unauthorized", message: "Session does not match the account owner." };
  }

  const { data: created, error: createErr } = await syncWriteClient(supabase)
    .from("user_broker_accounts")
    .insert({
      user_id: userId,
      provider: ALPACA_PROVIDER,
      label: "AXE Alpaca Paper",
      status: "active",
      connection_method: ALPACA_CONNECTION_METHOD,
      external_connection_id: alpacaAccountId,
      provider_status: "connected",
      hub_broker_id: "alpaca-style",
      trading_mode: "paper",
      hub_status: "connected",
      mt5_login: null,
      mt5_server: "Alpaca Paper",
      masked_login: accountNumber ? `…${accountNumber.slice(-4)}` : "PAPER",
      last_sync_at: now,
      metadata,
    })
    .select("id")
    .single();

  if (createErr || !created?.id) {
    return {
      ok: false,
      code: "insert_failed",
      message: createErr?.message ?? "Could not create Alpaca paper account row.",
    };
  }

  return { ok: true, accountId: created.id, created: true };
}
