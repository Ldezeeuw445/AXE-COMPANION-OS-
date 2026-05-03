import type { SupabaseClient } from "@supabase/supabase-js";

export type KnowledgeHit = {
  slug: string;
  title: string;
  category: string;
  chunkText: string;
  tags: string[];
  score: number;
};

function extractTerms(query: string): string[] {
  const raw = query.toLowerCase().match(/[a-z][a-z0-9]{2,}|[a-z]{3}/g) ?? [];
  return [...new Set(raw)].filter((t) => t.length >= 3).slice(0, 14);
}

function scoreChunk(text: string, terms: string[], symbol?: string | null): number {
  const hay = text.toLowerCase();
  let s = 0;
  for (const t of terms) {
    if (!t) continue;
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const m = hay.match(re);
    if (m) s += m.length * 2;
  }
  if (symbol) {
    const sym = symbol.toUpperCase();
    if (hay.includes(sym.toLowerCase())) s += 6;
    if (hay.includes(`symbol:${sym.toLowerCase()}`)) s += 8;
  }
  return s;
}

/**
 * Retrieves top relevant knowledge chunks for AXE (tag/category/text match).
 * Embeddings can replace ranking later; RLS applies on the caller's client.
 */
export async function getRelevantKnowledge(
  supabase: SupabaseClient,
  query: string,
  userId: string,
  symbol?: string | null,
  limit = 12,
): Promise<KnowledgeHit[]> {
  const terms = extractTerms(query);
  const effectiveTerms =
    terms.length > 0 ? terms : ["setup", "risk", "structure", "liquidity", "session", "trade"];

  const { data: docs, error: dErr } = await supabase
    .from("axe_knowledge_documents")
    .select("id,slug,title,category")
    .eq("active", true)
    .or(`user_id.is.null,user_id.eq.${userId}`);

  if (dErr || !docs?.length) return [];

  const docIds = docs.map((d) => d.id as string);
  const docMeta = new Map(
    docs.map((d) => [
      d.id as string,
      { slug: d.slug as string, title: d.title as string, category: d.category as string },
    ]),
  );

  const { data: chunks, error: cErr } = await supabase
    .from("axe_knowledge_chunks")
    .select("document_id,chunk_text,tags")
    .in("document_id", docIds)
    .limit(220);

  if (cErr || !chunks?.length) return [];

  const scored: KnowledgeHit[] = [];
  for (const row of chunks) {
    const did = row.document_id as string;
    const meta = docMeta.get(did);
    if (!meta) continue;
    const chunkText = (row.chunk_text as string) ?? "";
    const tags = (row.tags as string[]) ?? [];
    const textBlob = `${meta.title}\n${meta.category}\n${chunkText}\n${tags.join(" ")}`;
    const score = scoreChunk(textBlob, effectiveTerms, symbol);
    if (score <= 0) continue;
    scored.push({
      slug: meta.slug,
      title: meta.title,
      category: meta.category,
      chunkText,
      tags,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);
  const seen = new Set<string>();
  const dedup: KnowledgeHit[] = [];
  for (const h of top) {
    const k = `${h.slug}:${h.chunkText.slice(0, 120)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(h);
  }
  return dedup.slice(0, limit);
}
