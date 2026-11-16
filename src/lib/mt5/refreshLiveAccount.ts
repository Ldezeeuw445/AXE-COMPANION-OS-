import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { clientGetAccountInformation, clientGetPositions } from "@/lib/mt5/metaApiClient";
import { withActionBudget } from "@/lib/mt5/mt5ActionBudget";
import { figuresFromAccountInfo, mapMetaApiPosition } from "@/lib/mt5/liveAccountSnapshot";
import { persistLiveFiguresAndPositions } from "@/lib/mt5/persistLiveAccount";

/**
 * Fetch one fresh account state for the auto-trade guard — READ-ONLY.
 *
 * Calls MetaApi account-information and positions (GET requests), writes them
 * through the same `persistLiveFiguresAndPositions` every sync uses (which
 * rolls the broker-day anchors and trails the peak), and returns the account's
 * new metadata. It never places, modifies or closes an order, and never
 * touches deal history: this is the quick path, not `runCloudMt5Sync`.
 *
 * Returns null whenever it could not get a fresh state (not a cloud MT5
 * account, broker unreachable, timeout, nothing persisted). The guard then
 * stays fail-closed.
 */
const INFO_BUDGET_MS = 10_000;
const POSITIONS_BUDGET_MS = 8_000;

export async function refreshLiveAccountState(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
): Promise<Record<string, unknown> | null> {
  const { data: row, error } = await supabase
    .from("user_broker_accounts")
    .select("id,external_connection_id,connection_method,metadata")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !row?.external_connection_id || row.connection_method !== "cloud_mt5") return null;

  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const region = typeof meta.metaapiRegion === "string" ? meta.metaapiRegion : null;
  const extId = String(row.external_connection_id);

  let info: Record<string, unknown>;
  try {
    info = await withActionBudget(
      "guard_account_information",
      clientGetAccountInformation(extId, true, region),
      INFO_BUDGET_MS,
    );
  } catch (e) {
    console.error("[tradeGuard] live refresh failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
  const figures = figuresFromAccountInfo(info);
  if (figures.equity == null && figures.balance == null) return null;

  // Positions are optional here: without them the figures still persist and
  // the stored mt5_positions rows stay as they were.
  let positions: ReturnType<typeof mapMetaApiPosition>[] | undefined;
  try {
    const raw = await withActionBudget(
      "guard_positions",
      clientGetPositions(extId, false, region),
      POSITIONS_BUDGET_MS,
    );
    positions = (Array.isArray(raw) ? raw : [])
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && !Array.isArray(p))
      .map((p, i) => mapMetaApiPosition(p, i));
  } catch {
    positions = undefined;
  }

  await persistLiveFiguresAndPositions(supabase, { userId, accountId, figures, positions, force: true });

  const { data: after, error: afterErr } = await supabase
    .from("user_broker_accounts")
    .select("metadata")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (afterErr || !after?.metadata || typeof after.metadata !== "object" || Array.isArray(after.metadata)) {
    return null;
  }
  return after.metadata as Record<string, unknown>;
}
