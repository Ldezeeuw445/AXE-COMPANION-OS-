"use server";

import { revalidatePath } from "next/cache";
import { getMetadataSymbolMap } from "@/lib/broker/brokerSymbolRuntime";
import { cleanDisplaySymbol, resolveBrokerSymbol } from "@/lib/broker/symbolResolution";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";

export async function updatePinnedContext(
  conversationId: string,
  text: string
): Promise<{ error?: string }> {
  const authed = await getAuthedServiceSupabase();
  if (!authed) return { error: "Not authenticated" };

  const { supabase, user } = authed;
  const { error } = await supabase
    .from("conversations")
    .update({ pinned_context: text.trim() || null })
    .eq("id", conversationId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/chat");
  return {};
}

// Manual watchlist items are stored in assistant_memory_entries (scope="watchlist")
// so we never touch TradingOS's watch_requests schema constraints.
export async function listWatchlistItems(): Promise<
  { id: string; symbol: string; message: string | null }[]
> {
  const authed = await getAuthedServiceSupabase();
  if (!authed) return [];

  const { supabase, user } = authed;
  const { data, error } = await supabase
    .from("assistant_memory_entries")
    .select("id,entry_key,content")
    .eq("user_id", user.id)
    .eq("scope", "watchlist")
    .order("created_at", { ascending: true });

  if (error) return [];

  return (data ?? []).map((row) => ({
    id: row.id as string,
    symbol: (row.entry_key as string) ?? "",
    message: (row.content as string) !== (row.entry_key as string) ? (row.content as string) : null,
  }));
}

export async function addWatchlistItem(
  symbol: string,
  note: string
): Promise<{ error?: string }> {
  const authed = await getAuthedServiceSupabase();
  if (!authed) return { error: "Not authenticated" };

  const { supabase, user } = authed;
  const upper = symbol.trim().toUpperCase();
  if (!upper) return { error: "Symbol required" };

  // Upsert so duplicate symbols just update the note
  const { error } = await supabase.from("assistant_memory_entries").upsert(
    {
      user_id: user.id,
      scope: "watchlist",
      entry_key: upper,
      content: note.trim() || upper,
    },
    { onConflict: "user_id,scope,entry_key" }
  );

  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/watchlist");
  return {};
}

/** Add a display symbol to watchlist and ensure active account symbol_map includes it. */
export async function addBrokerWatchlistSymbol(
  displaySymbol: string,
  brokerSymbol?: string,
): Promise<{ error?: string }> {
  const authed = await getAuthedServiceSupabase();
  if (!authed) return { error: "Not authenticated" };

  const display = cleanDisplaySymbol(displaySymbol) || displaySymbol.trim().toUpperCase();
  if (!display) return { error: "Symbol required" };

  const watchlistResult = await addWatchlistItem(display, display);
  if (watchlistResult.error) return watchlistResult;

  const { supabase, user } = authed;
  const { data: prefs } = await supabase
    .from("user_workspace_preferences")
    .select("active_account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const activeId = (prefs?.active_account_id as string | null | undefined) ?? null;
  if (!activeId) return {};

  const { data: account } = await supabase
    .from("user_broker_accounts")
    .select("id,metadata,connection_method")
    .eq("user_id", user.id)
    .eq("id", activeId)
    .maybeSingle();
  if (!account || account.connection_method !== "cloud_mt5") return {};

  const meta = ((account.metadata ?? {}) as Record<string, unknown>) ?? {};
  const existingMap = getMetadataSymbolMap(meta);
  if (existingMap[display]) return {};

  const universeRaw = meta.symbol_universe;
  const universe =
    universeRaw &&
    typeof universeRaw === "object" &&
    !Array.isArray(universeRaw) &&
    Array.isArray((universeRaw as { symbols?: unknown }).symbols)
      ? ((universeRaw as { symbols: string[] }).symbols ?? [])
      : [];

  const resolvedBroker =
    brokerSymbol?.trim() ||
    existingMap[display] ||
    resolveBrokerSymbol(display, universe).brokerSymbol;
  if (!resolvedBroker) return {};

  const nextMap = { ...existingMap, [display]: resolvedBroker };
  await supabase
    .from("user_broker_accounts")
    .update({
      metadata: {
        ...meta,
        symbol_map: nextMap,
        symbol_map_updated_at: new Date().toISOString(),
      },
    })
    .eq("id", activeId)
    .eq("user_id", user.id);

  revalidatePath("/watchlist");
  revalidatePath("/chart");
  return {};
}

export async function removeWatchlistItem(id: string): Promise<{ error?: string }> {
  const authed = await getAuthedServiceSupabase();
  if (!authed) return { error: "Not authenticated" };

  const { supabase, user } = authed;
  const { error } = await supabase
    .from("assistant_memory_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("scope", "watchlist");

  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/watchlist");
  return {};
}

export async function getAccountName(): Promise<string> {
  const authed = await getAuthedServiceSupabase();
  if (!authed) return "";

  const { supabase, user } = authed;
  const { data } = await supabase
    .from("assistant_memory_entries")
    .select("content")
    .eq("user_id", user.id)
    .eq("scope", "account")
    .eq("entry_key", "name")
    .maybeSingle();

  return (data?.content as string) ?? "";
}

export async function saveAccountName(name: string): Promise<{ error?: string }> {
  const authed = await getAuthedServiceSupabase();
  if (!authed) return { error: "Not authenticated" };

  const { supabase, user } = authed;
  const { error } = await supabase.from("assistant_memory_entries").upsert(
    {
      user_id: user.id,
      scope: "account",
      entry_key: "name",
      content: name.trim(),
    },
    { onConflict: "user_id,scope,entry_key" }
  );

  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/chat");
  return {};
}
