import type { SupabaseClient } from "@supabase/supabase-js";
import { getRelevantIntelKnowledge } from "@/lib/axe/knowledgeRetrieval";

async function safeQuery<T>(query: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  try {
    const r = await query;
    if (r.error) return null;
    return r.data;
  } catch {
    return null;
  }
}

/**
 * Intel-specific knowledge layer: RAG on intel docs + saved correlations + user memory.
 */
export async function buildIntelKnowledgeLayerBlock(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  symbol?: string | null,
): Promise<string | null> {
  const sections: string[] = [];

  const hits = await getRelevantIntelKnowledge(supabase, userMessage, userId, symbol, 10);
  if (hits.length) {
    const lines = hits.map(
      (h, i) =>
        `[${i + 1}] ${h.title}\n${h.chunkText.slice(0, 1400)}${h.chunkText.length > 1400 ? "…" : ""}`,
    );
    sections.push(`INTEL KNOWLEDGE (RAG matches)\n${lines.join("\n\n")}`);
  }

  const savedCorrelations = await safeQuery(
    supabase
      .from("intel_correlations")
      .select("title,summary,confidence,signal,feeds_used,symbols,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
  );
  if (savedCorrelations?.length) {
    sections.push(
      `YOUR SAVED INTEL CORRELATIONS\n${savedCorrelations
        .map(
          (c: Record<string, unknown>) =>
            `— ${c.title} [${c.confidence}] signal=${c.signal ?? "none"} feeds=${((c.feeds_used as string[]) ?? []).join(",")} symbols=${((c.symbols as string[]) ?? []).join(",")}\n${String(c.summary).slice(0, 280)}`,
        )
        .join("\n\n")}`,
    );
  }

  const snapshot = await safeQuery(
    supabase
      .from("axe_correlation_snapshots")
      .select("correlations,generated_at")
      .eq("user_id", userId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (snapshot && typeof snapshot === "object") {
    const row = snapshot as { correlations?: unknown[]; generated_at?: string };
    const cors = Array.isArray(row.correlations) ? row.correlations.slice(0, 4) : [];
    if (cors.length) {
      sections.push(
        `LATEST CORRELATION SNAPSHOT (${row.generated_at?.slice(0, 16) ?? "recent"})\n${cors
          .map((c) => {
            const item = c as Record<string, unknown>;
            return `— ${item.title}: ${String(item.summary ?? "").slice(0, 200)}`;
          })
          .join("\n")}`,
      );
    }
  }

  const memories = await safeQuery(
    supabase
      .from("axe_memory")
      .select("memory_type,content,symbol,confidence")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(6),
  );
  if (memories?.length) {
    sections.push(
      `TRADER MEMORY (intel-relevant)\n${memories
        .map(
          (m: Record<string, unknown>) =>
            `— [${m.memory_type}] ${m.symbol ?? "—"}: ${String(m.content).slice(0, 180)}`,
        )
        .join("\n")}`,
    );
  }

  if (!sections.length) return null;
  return sections.join("\n\n");
}
