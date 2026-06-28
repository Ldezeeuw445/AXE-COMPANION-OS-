import type { SupabaseClient } from "@supabase/supabase-js";
import { embedQuery } from "@/lib/axe/embeddings";

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

type SemanticRow = {
  slug: string;
  title: string;
  category: string;
  chunk_text: string;
  tags: string[] | null;
  similarity: number;
};

async function getSemanticKnowledge(
  supabase: SupabaseClient,
  query: string,
  userId: string,
  limit: number,
): Promise<KnowledgeHit[] | null> {
  const embedding = await embedQuery(query);
  if (!embedding) return null;

  const { data, error } = await supabase.rpc("match_axe_knowledge_chunks", {
    query_embedding: embedding,
    match_count: limit,
    match_user_id: userId,
  });

  if (error) {
    if (error.code === "42883" || error.message?.includes("match_axe_knowledge_chunks")) return null;
    console.error("[knowledgeRetrieval] semantic search failed", error.message);
    return null;
  }

  const rows = (data ?? []) as SemanticRow[];
  if (!rows.length) return null;

  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    category: row.category,
    chunkText: row.chunk_text,
    tags: row.tags ?? [],
    score: Math.round((row.similarity ?? 0) * 100),
  }));
}

function dedupeHits(hits: KnowledgeHit[], limit: number): KnowledgeHit[] {
  const seen = new Set<string>();
  const dedup: KnowledgeHit[] = [];
  for (const h of hits) {
    const k = `${h.slug}:${h.chunkText.slice(0, 120)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(h);
  }
  return dedup.slice(0, limit);
}

async function getKeywordKnowledge(
  supabase: SupabaseClient,
  query: string,
  userId: string,
  symbol: string | null | undefined,
  limit: number,
  categories?: string[],
): Promise<KnowledgeHit[]> {
  const terms = extractTerms(query);
  const defaultTerms = categories?.includes("intel")
    ? ["correlation", "tide", "energy", "geopolitical", "dark", "pool", "insider", "vessel", "signal"]
    : ["setup", "risk", "structure", "liquidity", "session", "trade"];
  const effectiveTerms = terms.length > 0 ? terms : defaultTerms;

  let docQuery = supabase
    .from("axe_knowledge_documents")
    .select("id,slug,title,category")
    .eq("active", true)
    .or(`user_id.is.null,user_id.eq.${userId}`);

  if (categories?.length) {
    docQuery = docQuery.in("category", categories);
  }

  const { data: docs, error: dErr } = await docQuery;

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
  return dedupeHits(scored, limit);
}

/**
 * Retrieves top relevant knowledge chunks for AXE.
 * Tries pgvector semantic search first; falls back to keyword scoring.
 */
export async function getRelevantKnowledge(
  supabase: SupabaseClient,
  query: string,
  userId: string,
  symbol?: string | null,
  limit = 12,
  categories?: string[],
): Promise<KnowledgeHit[]> {
  const fetchLimit = categories?.length ? Math.max(limit * 3, 24) : limit;
  const semantic = await getSemanticKnowledge(supabase, query, userId, fetchLimit);
  if (semantic?.length) {
    const filtered = categories?.length
      ? semantic.filter((h) => categories.includes(h.category))
      : semantic;
    if (filtered.length) return filtered.slice(0, limit);
  }

  return getKeywordKnowledge(supabase, query, userId, symbol, limit, categories);
}

/** Intel RAG — searches `knowledge/intel/*` docs (category: intel). Always includes core intel docs. */
export async function getRelevantIntelKnowledge(
  supabase: SupabaseClient,
  query: string,
  userId: string,
  symbol?: string | null,
  limit = 10,
): Promise<KnowledgeHit[]> {
  const hits = await getRelevantKnowledge(supabase, query, userId, symbol, limit, ["intel"]);
  if (hits.length >= 3) return hits;

  const core = await getCoreIntelKnowledge(supabase, userId);
  return dedupeHits([...hits, ...core], limit);
}

async function getCoreIntelKnowledge(
  supabase: SupabaseClient,
  userId: string,
): Promise<KnowledgeHit[]> {
  const slugs = ["intel/correlation-framework", "intel/feed-guide", "intel/cross-market-signals"];
  const { data: docs } = await supabase
    .from("axe_knowledge_documents")
    .select("id,slug,title,category")
    .eq("active", true)
    .in("slug", slugs)
    .or(`user_id.is.null,user_id.eq.${userId}`);

  if (!docs?.length) return [];

  const docIds = docs.map((d) => d.id as string);
  const docMeta = new Map(
    docs.map((d) => [
      d.id as string,
      { slug: d.slug as string, title: d.title as string, category: d.category as string },
    ]),
  );

  const { data: chunks } = await supabase
    .from("axe_knowledge_chunks")
    .select("document_id,chunk_text,tags,chunk_index")
    .in("document_id", docIds)
    .order("chunk_index", { ascending: true });

  if (!chunks?.length) return [];

  const seen = new Set<string>();
  const out: KnowledgeHit[] = [];
  for (const row of chunks) {
    const did = row.document_id as string;
    const meta = docMeta.get(did);
    if (!meta || seen.has(meta.slug)) continue;
    seen.add(meta.slug);
    out.push({
      slug: meta.slug,
      title: meta.title,
      category: meta.category,
      chunkText: (row.chunk_text as string) ?? "",
      tags: (row.tags as string[]) ?? [],
      score: 50,
    });
  }
  return out;
}
