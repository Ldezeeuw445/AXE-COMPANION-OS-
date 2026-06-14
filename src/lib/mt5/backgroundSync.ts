import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { metadataHasSymbolMap } from "@/lib/broker/brokerSymbolRuntime";
import { refreshCloudAccountSymbolMap, runCloudMt5Sync } from "@/lib/mt5/syncCloudAccount";

const DEFAULT_STALE_MS = 10 * 60 * 1000;
const PROVISIONING_STATUSES = new Set(["provisioning", "connecting", "syncing"]);

export type BackgroundSyncSummary = {
  scanned: number;
  synced: number;
  skipped: number;
  failures: Array<{ accountId: string; userId: string; error: string }>;
};

export type SymbolMapBackfillSummary = {
  scanned: number;
  refreshed: number;
  skipped: number;
  failures: Array<{ accountId: string; userId: string; error: string }>;
};

type CloudAccountRow = {
  id: string;
  user_id: string;
  last_sync_at?: string | null;
  provider_status?: string | null;
  external_connection_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

function isProvisioning(status: string | null | undefined): boolean {
  return PROVISIONING_STATUSES.has(String(status ?? "").toLowerCase());
}

/**
 * Sync cloud MT5 accounts whose last_sync_at is older than minAgeMs.
 * Intended for Vercel Cron — processes at most maxAccounts per invocation.
 */
export async function syncStaleMt5Accounts(
  supabase: SupabaseClient,
  opts: { maxAccounts?: number; minAgeMs?: number } = {},
): Promise<BackgroundSyncSummary> {
  const maxAccounts = Math.max(1, Math.min(10, opts.maxAccounts ?? 5));
  const minAgeMs = opts.minAgeMs ?? DEFAULT_STALE_MS;
  const cutoff = new Date(Date.now() - minAgeMs).toISOString();

  const { data: accounts, error } = await supabase
    .from("user_broker_accounts")
    .select("id,user_id,last_sync_at,provider_status,external_connection_id")
    .eq("connection_method", "cloud_mt5")
    .eq("status", "active")
    .not("external_connection_id", "is", null)
    .or(`last_sync_at.is.null,last_sync_at.lt.${cutoff}`)
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(maxAccounts);

  if (error) {
    return { scanned: 0, synced: 0, skipped: 0, failures: [{ accountId: "-", userId: "-", error: error.message }] };
  }

  const summary: BackgroundSyncSummary = {
    scanned: accounts?.length ?? 0,
    synced: 0,
    skipped: 0,
    failures: [],
  };

  for (const row of accounts ?? []) {
    if (isProvisioning(row.provider_status)) {
      summary.skipped += 1;
      continue;
    }

    const result = await runCloudMt5Sync(supabase, row.user_id as string, row.id as string, {
      revalidate: false,
      autoJournal: true,
      allowEmptyDeals: true,
    });

    if (result.ok) {
      summary.synced += 1;
    } else if (result.code === "validation" || result.code === "provider_not_configured") {
      summary.skipped += 1;
    } else {
      summary.failures.push({
        accountId: row.id as string,
        userId: row.user_id as string,
        error: result.message,
      });
    }
  }

  return summary;
}

/**
 * Backfill metadata.symbol_map for active cloud_mt5 accounts that are missing it.
 * Lightweight — no deal history sync. Railway streamer picks up changes on next reconcile.
 */
export async function syncAccountsMissingSymbolMap(
  supabase: SupabaseClient,
  opts: { maxAccounts?: number } = {},
): Promise<SymbolMapBackfillSummary> {
  const maxAccounts = Math.max(1, Math.min(10, opts.maxAccounts ?? 5));

  const { data: accounts, error } = await supabase
    .from("user_broker_accounts")
    .select("id,user_id,provider_status,external_connection_id,metadata")
    .eq("connection_method", "cloud_mt5")
    .eq("status", "active")
    .not("external_connection_id", "is", null)
    .limit(40);

  if (error) {
    return { scanned: 0, refreshed: 0, skipped: 0, failures: [{ accountId: "-", userId: "-", error: error.message }] };
  }

  const needsMap = ((accounts ?? []) as CloudAccountRow[]).filter(
    (row) => !isProvisioning(row.provider_status) && !metadataHasSymbolMap(row.metadata),
  );

  const summary: SymbolMapBackfillSummary = {
    scanned: needsMap.length,
    refreshed: 0,
    skipped: 0,
    failures: [],
  };

  for (const row of needsMap.slice(0, maxAccounts)) {
    const result = await refreshCloudAccountSymbolMap(supabase, row.user_id as string, row.id as string, {
      probe: true,
    });

    if (result.ok) {
      summary.refreshed += 1;
    } else if (result.code === "validation" || result.code === "provider_not_configured") {
      summary.skipped += 1;
    } else {
      summary.failures.push({
        accountId: row.id as string,
        userId: row.user_id as string,
        error: result.message,
      });
    }
  }

  return summary;
}

/**
 * Fire a background sync when the user opens journal/history and data is stale.
 * Returns immediately when still fresh.
 */
export async function syncAccountIfStale(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  minAgeMs: number = DEFAULT_STALE_MS,
): Promise<{ triggered: boolean; reason: string }> {
  const { data: row } = await supabase
    .from("user_broker_accounts")
    .select("last_sync_at,provider_status,connection_method,external_connection_id,metadata")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!row?.external_connection_id || row.connection_method !== "cloud_mt5") {
    return { triggered: false, reason: "not_cloud_mt5" };
  }

  if (isProvisioning(row.provider_status)) {
    return { triggered: false, reason: "provisioning" };
  }

  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null;

  if (!metadataHasSymbolMap(meta)) {
    void refreshCloudAccountSymbolMap(supabase, userId, accountId, { probe: false }).catch((e) =>
      console.error("[mt5Sync] symbol map refresh failed:", e),
    );
    return { triggered: true, reason: "missing_symbol_map" };
  }

  const lastSync = row.last_sync_at ? Date.parse(String(row.last_sync_at)) : 0;
  if (lastSync > 0 && Date.now() - lastSync < minAgeMs) {
    return { triggered: false, reason: "fresh" };
  }

  void runCloudMt5Sync(supabase, userId, accountId, {
    revalidate: false,
    autoJournal: true,
    allowEmptyDeals: true,
  }).catch((e) => console.error("[mt5Sync] stale sync failed:", e));

  return { triggered: true, reason: "stale" };
}
