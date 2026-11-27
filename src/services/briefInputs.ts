import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  digestAccount,
  type AccountDigest,
  type AccountRow,
  type PositionRow,
} from "@/lib/briefing/accountsDigest";
import { normalizeBriefFocusPrefs, type BriefFocusPrefs } from "@/lib/briefing/briefFocus";

/**
 * The inputs a brief, a recap and AXE chat need beyond market data:
 * the trader's own watchlist (Settings → My watchlist), their brief focus
 * (Settings → Morning brief focus) and every linked account.
 *
 * Reads only. Each read fails soft to "nothing" and the caller says so.
 */

export const BRIEF_FOCUS_SCOPE = "brief_focus";
export const BRIEF_FOCUS_KEY = "settings";

/** Accounts that no longer count as "linked". */
const GONE_STATUSES = new Set(["deleted", "archived", "removed", "revoked", "disconnected"]);

export async function loadWatchlistSymbols(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const [rows, order] = await Promise.all([
    supabase
      .from("assistant_memory_entries")
      .select("entry_key")
      .eq("user_id", userId)
      .eq("scope", "watchlist")
      .order("created_at", { ascending: true }),
    supabase
      .from("assistant_memory_entries")
      .select("content")
      .eq("user_id", userId)
      .eq("scope", "watchlist_order")
      .eq("entry_key", "symbols")
      .maybeSingle(),
  ]);
  const symbols = (rows.data ?? []).map((r) => String(r.entry_key ?? "").trim().toUpperCase()).filter(Boolean);
  let saved: string[] = [];
  try {
    const parsed = JSON.parse(String(order.data?.content ?? "[]")) as unknown;
    if (Array.isArray(parsed)) saved = parsed.map((v) => String(v).trim().toUpperCase()).filter(Boolean);
  } catch {
    saved = [];
  }
  const ordered = saved.filter((s) => symbols.includes(s));
  return [...ordered, ...symbols.filter((s) => !ordered.includes(s))];
}

export async function loadBriefFocusPrefs(supabase: SupabaseClient, userId: string): Promise<BriefFocusPrefs> {
  const { data } = await supabase
    .from("assistant_memory_entries")
    .select("content")
    .eq("user_id", userId)
    .eq("scope", BRIEF_FOCUS_SCOPE)
    .eq("entry_key", BRIEF_FOCUS_KEY)
    .maybeSingle();
  try {
    return normalizeBriefFocusPrefs(data?.content ? JSON.parse(String(data.content)) : null);
  } catch {
    return normalizeBriefFocusPrefs(null);
  }
}

export async function loadAccountDigests(
  supabase: SupabaseClient,
  userId: string,
  now: Date,
  opts: { marketsOpen: boolean },
): Promise<{ accounts: AccountDigest[]; positions: PositionRow[]; error: string | null }> {
  const [accRes, posRes] = await Promise.all([
    supabase
      .from("user_broker_accounts")
      .select("id,label,status,mt5_server,metadata,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(30),
    supabase
      .from("mt5_positions")
      .select("account_id,symbol,type,volume,profit,swap,stop_loss,take_profit")
      .eq("user_id", userId)
      .limit(200),
  ]);
  if (accRes.error) return { accounts: [], positions: [], error: accRes.error.message };
  const positions = (posRes.data ?? []) as PositionRow[];
  const rows: AccountRow[] = (accRes.data ?? [])
    .filter((r) => !GONE_STATUSES.has(String(r.status ?? "").toLowerCase()))
    .map((r) => ({
      id: String(r.id),
      label: (r.label as string | null) ?? null,
      status: (r.status as string | null) ?? null,
      server: (r.mt5_server as string | null) ?? null,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    }));
  return {
    accounts: rows.map((row) => digestAccount(row, positions, now, opts)),
    positions,
    error: posRes.error ? posRes.error.message : null,
  };
}
