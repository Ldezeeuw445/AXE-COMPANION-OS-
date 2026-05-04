"use server";

import { revalidatePath } from "next/cache";
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
