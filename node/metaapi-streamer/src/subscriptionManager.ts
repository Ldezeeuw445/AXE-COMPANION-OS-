/**
 * Dynamic subscription manager — loads account configs and watchlist symbols
 * from Supabase instead of a static SUBSCRIPTIONS env var.
 *
 * On startup and every RECONCILE_INTERVAL_MS, queries:
 *   1. user_broker_accounts (connection_method = 'cloud_mt5', status = 'active')
 *   2. assistant_memory_entries (scope = 'watchlist') for each user
 *   3. account metadata.symbol_map for broker symbol resolution
 *
 * Returns AccountConfig[] that the main loop uses to manage streaming connections.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AccountConfig } from "./types.js";

export const RECONCILE_INTERVAL_MS = 60_000; // check for changes every 60s

/** Canonical symbols — always subscribed even if not in watchlist. */
const CORE_SYMBOLS = [
  "XAUUSD",
  "XAGUSD",
  "US30",
  "NAS100",
  "SPX500",
  "BTCUSD",
  "ETHUSD",
  "AUDUSD",
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AAPL",
  "JPM",
  "NVDA",
  "PLTR",
  "BRENT",
  "WTI",
  "TSLA",
];

function getSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type BrokerAccountRow = {
  id: string;
  user_id: string;
  external_connection_id: string;
  connection_method: string;
  provider_status: string | null;
  metadata: Record<string, unknown> | null;
};

type WatchlistRow = {
  user_id: string;
  entry_key: string;
};

function extractSymbolMap(metadata: Record<string, unknown> | null): Record<string, string> {
  const raw = metadata?.symbol_map;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k.toUpperCase()] = v.trim();
  }
  return out;
}

function extractRegion(metadata: Record<string, unknown> | null): string {
  const region = metadata?.metaapiRegion;
  return typeof region === "string" && region.length > 0 ? region : "london";
}

/**
 * Load all active MT5 cloud accounts and their watchlist symbols.
 */
export async function loadAccountConfigs(): Promise<AccountConfig[]> {
  const supabase = getSupabaseClient();

  // 1. Get all active cloud_mt5 accounts
  const { data: accounts, error: accErr } = await supabase
    .from("user_broker_accounts")
    .select("id,user_id,external_connection_id,connection_method,provider_status,metadata")
    .eq("connection_method", "cloud_mt5")
    .eq("status", "active");

  if (accErr) {
    console.error("[sub-mgr] Failed to load broker accounts:", accErr.message);
    return [];
  }

  if (!accounts || accounts.length === 0) {
    console.warn("[sub-mgr] No active cloud_mt5 accounts found");
    return [];
  }

  // 2. Get all watchlist entries
  const userIds = [...new Set((accounts as BrokerAccountRow[]).map((a) => a.user_id))];
  const { data: watchlistEntries, error: wlErr } = await supabase
    .from("assistant_memory_entries")
    .select("user_id,entry_key")
    .eq("scope", "watchlist")
    .in("user_id", userIds);

  if (wlErr) {
    console.warn("[sub-mgr] Failed to load watchlist:", wlErr.message);
  }

  // Group watchlist by user
  const watchlistByUser = new Map<string, string[]>();
  for (const entry of (watchlistEntries ?? []) as WatchlistRow[]) {
    const key = entry.entry_key?.toUpperCase();
    if (!key) continue;
    const arr = watchlistByUser.get(entry.user_id) ?? [];
    arr.push(key);
    watchlistByUser.set(entry.user_id, arr);
  }

  // 3. Build configs
  const configs: AccountConfig[] = [];
  for (const acc of accounts as BrokerAccountRow[]) {
    const extId = acc.external_connection_id;
    if (!extId) {
      console.warn(`[sub-mgr] Account ${acc.id} has no external_connection_id — skipping`);
      continue;
    }

    const symbolMap = extractSymbolMap(acc.metadata);
    const userWatchlist = watchlistByUser.get(acc.user_id) ?? [];

    // Merge core symbols + user watchlist, deduplicate
    const allDisplaySymbols = [...new Set([...CORE_SYMBOLS, ...userWatchlist])];

    // Resolve each display symbol to a broker symbol via the symbol_map
    const resolvedSymbols: string[] = [];
    for (const display of allDisplaySymbols) {
      const broker = symbolMap[display];
      if (broker) {
        resolvedSymbols.push(display);
      }
    }

    if (resolvedSymbols.length === 0) {
      console.warn(
        `[sub-mgr] Account ${acc.id} has no resolved symbols (symbol_map may be empty) — ` +
          `including all ${allDisplaySymbols.length} display symbols as-is`
      );
    }

    configs.push({
      userId: acc.user_id,
      accountId: acc.id,
      metaApiAccountId: extId,
      region: extractRegion(acc.metadata),
      symbolMap,
      watchlistSymbols: resolvedSymbols.length > 0 ? resolvedSymbols : allDisplaySymbols,
    });
  }

  return configs;
}

/**
 * Diff current vs new configs and return what changed.
 */
export function diffConfigs(
  current: AccountConfig[],
  next: AccountConfig[]
): {
  added: AccountConfig[];
  removed: AccountConfig[];
  symbolsChanged: Array<{
    config: AccountConfig;
    addedSymbols: string[];
    removedSymbols: string[];
  }>;
} {
  const currentMap = new Map(current.map((c) => [c.metaApiAccountId, c]));
  const nextMap = new Map(next.map((c) => [c.metaApiAccountId, c]));

  const added: AccountConfig[] = [];
  const removed: AccountConfig[] = [];
  const symbolsChanged: Array<{
    config: AccountConfig;
    addedSymbols: string[];
    removedSymbols: string[];
  }> = [];

  // New accounts
  for (const [id, config] of nextMap) {
    if (!currentMap.has(id)) {
      added.push(config);
    }
  }

  // Removed accounts
  for (const [id, config] of currentMap) {
    if (!nextMap.has(id)) {
      removed.push(config);
    }
  }

  // Symbol changes in existing accounts
  for (const [id, nextConfig] of nextMap) {
    const currentConfig = currentMap.get(id);
    if (!currentConfig) continue;

    const currentSyms = new Set(currentConfig.watchlistSymbols);
    const nextSyms = new Set(nextConfig.watchlistSymbols);

    const addedSymbols = nextConfig.watchlistSymbols.filter((s) => !currentSyms.has(s));
    const removedSymbols = currentConfig.watchlistSymbols.filter((s) => !nextSyms.has(s));

    if (addedSymbols.length > 0 || removedSymbols.length > 0) {
      symbolsChanged.push({ config: nextConfig, addedSymbols, removedSymbols });
    }
  }

  return { added, removed, symbolsChanged };
}
