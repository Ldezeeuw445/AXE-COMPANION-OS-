import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reads back the RAG files AXE has written about one trader, so the cockpit can
 * show what the assistant actually knows rather than asserting that it learns.
 *
 * Read with the caller's own session, not the service role: these documents are
 * the trader's own, and RLS on axe_knowledge_documents should be the thing that
 * decides that, not this function remembering to filter.
 */

export type UserKnowledgeFile = {
  slug: string;
  topic: string;
  title: string;
  content: string;
  chunkCount: number;
  embeddedCount: number;
  updatedAt: string | null;
};

export type UserKnowledgeOverview = {
  files: UserKnowledgeFile[];
  /** Shipped seed documents every user retrieves, for honest context. */
  sharedDocCount: number;
};

function topicFromSlug(slug: string): string {
  const tail = slug.split("/").pop() ?? slug;
  return tail.replace(/[-_]/g, " ");
}

export async function getUserKnowledgeOverview(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserKnowledgeOverview> {
  const empty: UserKnowledgeOverview = { files: [], sharedDocCount: 0 };

  const [ownRes, sharedRes] = await Promise.all([
    supabase
      .from("axe_knowledge_documents")
      .select("id,slug,title,content,updated_at")
      .eq("user_id", userId)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(12),
    supabase
      .from("axe_knowledge_documents")
      .select("id", { count: "exact", head: true })
      .is("user_id", null)
      .eq("active", true),
  ]);

  if (ownRes.error) {
    console.error("[userKnowledgeRead] own docs failed", ownRes.error.message);
    return { ...empty, sharedDocCount: sharedRes.count ?? 0 };
  }

  const docs = ownRes.data ?? [];
  if (!docs.length) return { ...empty, sharedDocCount: sharedRes.count ?? 0 };

  // One round trip for every document's chunks, then counted in memory — a
  // per-document count query would be a dozen round trips for a dozen numbers.
  const { data: chunks } = await supabase
    .from("axe_knowledge_chunks")
    .select("document_id,embedding")
    .in(
      "document_id",
      docs.map((d) => d.id as string),
    );

  const counts = new Map<string, { total: number; embedded: number }>();
  for (const row of chunks ?? []) {
    const key = row.document_id as string;
    const entry = counts.get(key) ?? { total: 0, embedded: 0 };
    entry.total += 1;
    if (row.embedding != null) entry.embedded += 1;
    counts.set(key, entry);
  }

  return {
    sharedDocCount: sharedRes.count ?? 0,
    files: docs.map((doc) => {
      const slug = doc.slug as string;
      const count = counts.get(doc.id as string) ?? { total: 0, embedded: 0 };
      return {
        slug,
        topic: topicFromSlug(slug),
        title: (doc.title as string) ?? topicFromSlug(slug),
        content: (doc.content as string) ?? "",
        chunkCount: count.total,
        embeddedCount: count.embedded,
        updatedAt: (doc.updated_at as string) ?? null,
      };
    }),
  };
}
