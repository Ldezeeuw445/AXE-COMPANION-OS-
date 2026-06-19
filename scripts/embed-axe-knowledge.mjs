/**
 * Embeds axe_knowledge_chunks without vectors using OpenAI text-embedding-3-small.
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 * Run: node scripts/embed-axe-knowledge.mjs
 */
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;
const BATCH_SIZE = 32;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_API_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!apiKey) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey });

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIM,
  });
  return res.data.map((row) => row.embedding);
}

async function main() {
  const { data: chunks, error } = await supabase
    .from("axe_knowledge_chunks")
    .select("id,chunk_text,document_id")
    .is("embedding", null)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    console.error("Failed to load chunks:", error.message);
    process.exit(1);
  }

  if (!chunks?.length) {
    console.log("No chunks missing embeddings.");
    return;
  }

  console.log(`Embedding ${chunks.length} chunks…`);

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => String(c.chunk_text).slice(0, 8000));
    const vectors = await embedBatch(texts);

    for (let j = 0; j < batch.length; j += 1) {
      const chunk = batch[j];
      const embedding = vectors[j];
      if (!embedding) continue;
      const { error: upErr } = await supabase
        .from("axe_knowledge_chunks")
        .update({ embedding })
        .eq("id", chunk.id);
      if (upErr) console.error("Update failed", chunk.id, upErr.message);
    }

    console.log(`  ${Math.min(i + BATCH_SIZE, chunks.length)} / ${chunks.length}`);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
