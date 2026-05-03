import { mockMemory } from "@/services/mock/seed";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import type { MemoryEntryPreview } from "@/types/domain";

export async function listMemoryPreview(): Promise<MemoryEntryPreview[]> {
  const authed = await getAuthedServiceSupabase();

  if (!authed) {
    return mockMemory;
  }

  const { data, error } = await authed.supabase
    .from("assistant_memory_entries")
    .select("id,scope,entry_key,content")
    .eq("user_id", authed.user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("[memoryService] listMemoryPreview error:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    scope: row.scope,
    key: row.entry_key ?? null,
    excerpt: (row.content ?? "").slice(0, 140),
  }));
}
