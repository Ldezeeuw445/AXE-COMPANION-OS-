import { mockVaultMedia, mockVaultNotes } from "@/services/mock/seed";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import type { VaultMediaItem, VaultNote } from "@/types/domain";

export async function listVaultNotes(): Promise<VaultNote[]> {
  const authed = await getAuthedServiceSupabase();

  if (!authed) {
    return mockVaultNotes;
  }

  const { data, error } = await authed.supabase
    .from("notes")
    .select("id,title,body,tags,symbol,created_at")
    .eq("user_id", authed.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[vaultService] listVaultNotes error:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body ?? "",
    tags: row.tags ?? [],
    symbol: row.symbol ?? null,
    createdAt: row.created_at,
  }));
}

export async function listVaultMedia(): Promise<VaultMediaItem[]> {
  const authed = await getAuthedServiceSupabase();

  if (!authed) {
    return mockVaultMedia;
  }

  const { data, error } = await authed.supabase
    .from("vault_items")
    .select("id,type,title,symbol,tags,created_at,storage_path,metadata")
    .eq("user_id", authed.user.id)
    .neq("type", "note")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[vaultService] listVaultMedia error:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type as VaultMediaItem["type"],
    title: row.title,
    symbol: row.symbol ?? null,
    tags: row.tags ?? [],
    createdAt: row.created_at,
    thumbHint:
      typeof row.metadata?.thumbHint === "string"
        ? row.metadata.thumbHint
        : row.storage_path ?? undefined,
  }));
}
