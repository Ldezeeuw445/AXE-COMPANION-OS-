import "server-only";

import fs from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;
const BATCH_SIZE = 32;
const KNOWLEDGE_ROOT = path.join(process.cwd(), "knowledge");

export type KnowledgeSyncSummary = {
  docsSeeded: number;
  chunksEmbedded: number;
  errors: string[];
};

function walkMdFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walkMdFiles(p, acc);
    else if (name.isFile() && name.name.endsWith(".md")) acc.push(p);
  }
  return acc;
}

function slugFromPath(absPath: string): string {
  const rel = path.relative(KNOWLEDGE_ROOT, absPath).replace(/\\/g, "/");
  return rel.replace(/\.md$/i, "");
}

function titleFromSlug(slug: string): string {
  const base = slug.split("/").pop() ?? slug;
  return base
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function inferTags(slug: string, body: string): string[] {
  const tags = new Set<string>();
  const parts = slug.split("/");
  tags.add(`path:${parts[0]}`);
  if (parts[1]) tags.add(`topic:${parts[1]}`);
  if (/XAUUSD|gold/i.test(body)) tags.add("XAUUSD");
  if (/BTC|bitcoin/i.test(body)) tags.add("BTCUSD");
  if (/EURUSD/i.test(body)) tags.add("EURUSD");
  return [...tags];
}

function chunkText(text: string, max = 1100): string[] {
  const paras = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > max && cur) {
      out.push(cur.trim());
      cur = p;
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) out.push(cur.trim());
  return out.length ? out : [text.slice(0, max)];
}

async function seedKnowledgeDocs(
  supabase: SupabaseClient,
): Promise<{ docsSeeded: number; errors: string[] }> {
  const files = walkMdFiles(KNOWLEDGE_ROOT).sort();
  let docsSeeded = 0;
  const errors: string[] = [];

  for (const file of files) {
    const slug = slugFromPath(file);
    const body = fs.readFileSync(file, "utf8");
    const category = slug.split("/")[0] ?? "general";
    const title = titleFromSlug(slug);
    const tags = inferTags(slug, body);

    const { data: docRow, error: upErr } = await supabase
      .from("axe_knowledge_documents")
      .upsert(
        {
          slug,
          title,
          category,
          content: body,
          source_type: "seed",
          tags,
          user_id: null,
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single();

    if (upErr) {
      errors.push(`doc:${slug}:${upErr.message}`);
      continue;
    }

    const docId = docRow.id as string;
    await supabase.from("axe_knowledge_chunks").delete().eq("document_id", docId);
    const chunks = chunkText(body);
    const rows = chunks.map((chunk_text, chunk_index) => ({
      document_id: docId,
      chunk_index,
      chunk_text,
      tags,
    }));
    const { error: chErr } = await supabase.from("axe_knowledge_chunks").insert(rows);
    if (chErr) errors.push(`chunks:${slug}:${chErr.message}`);
    else docsSeeded += 1;
  }

  return { docsSeeded, errors };
}

async function embedMissingChunks(
  supabase: SupabaseClient,
  openai: OpenAI,
): Promise<number> {
  let embedded = 0;

  for (;;) {
    const { data: chunks, error } = await supabase
      .from("axe_knowledge_chunks")
      .select("id,chunk_text")
      .is("embedding", null)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (error || !chunks?.length) break;

    const texts = chunks.map((c) => String(c.chunk_text).slice(0, 8000));
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIM,
    });

    for (let i = 0; i < chunks.length; i += 1) {
      const vector = res.data[i]?.embedding;
      if (!vector) continue;
      const { error: upErr } = await supabase
        .from("axe_knowledge_chunks")
        .update({ embedding: vector })
        .eq("id", chunks[i].id);
      if (!upErr) embedded += 1;
    }
  }

  return embedded;
}

export async function runKnowledgeSync(
  supabase: SupabaseClient,
): Promise<KnowledgeSyncSummary> {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_API_KEY;
  const { docsSeeded, errors } = await seedKnowledgeDocs(supabase);

  if (!apiKey) {
    return { docsSeeded, chunksEmbedded: 0, errors: [...errors, "missing_openai_api_key"] };
  }

  const openai = new OpenAI({ apiKey });
  const chunksEmbedded = await embedMissingChunks(supabase, openai);
  return { docsSeeded, chunksEmbedded, errors };
}
