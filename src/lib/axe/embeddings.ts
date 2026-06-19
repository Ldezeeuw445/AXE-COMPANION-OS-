import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;

export function getOpenAiApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY?.trim() || process.env.OPEN_AI_API_KEY?.trim() || undefined;
}

/** Embed a single query string for vector retrieval. Returns null when OpenAI is unavailable. */
export async function embedQuery(text: string): Promise<number[] | null> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const client = new OpenAI({ apiKey });
    const res = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: trimmed,
      dimensions: EMBEDDING_DIM,
    });
    const vector = res.data[0]?.embedding;
    return Array.isArray(vector) && vector.length === EMBEDDING_DIM ? vector : null;
  } catch (e) {
    console.error("[embeddings] embedQuery failed", e);
    return null;
  }
}
