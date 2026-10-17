/**
 * Which Ollama to call, and with which model.
 *
 * Two things were wrong, both of the kind this audit keeps finding — a green
 * check that means nothing.
 *
 * 1. `ollamaHealth()` asked `/api/tags` and returned `res.ok`. Measured on
 *    2026-10-17: `ollama.axecompanion.com` answers 200 with twelve models,
 *    none of them `qwen3:4b` — the router's default. So health reported
 *    `ok_ollama` while every actual chat came back
 *    `{"error":"model 'qwen3:4b' not found"}` and fell through to OpenAI.
 *    A reachable server is not a usable one.
 *
 * 2. `OLLAMA_URL` held a single address. There are two: a small always-on
 *    server, and a Mac Mini behind a Cloudflare Tunnel with the big models.
 *    A list lets the always-on one answer when the Mac is asleep.
 *
 * Dependency-free so `node --experimental-strip-types` can exercise it.
 */

/** Models that cannot hold a conversation, whatever else is true of them. */
const EMBEDDING_HINTS = ["embed", "bge-", "gte-", "e5-"];

/**
 * Chat models worth preferring when the configured one is absent, best first.
 * Deliberately conservative: a general instruct model beats a coder model for
 * the kind of thing AXE asks, and a reasoning model that thinks out loud is
 * worse than one that answers.
 */
const PREFERRED_FALLBACKS = [
  "llama3.1:8b",
  "llama3:latest",
  "qwen3.5:4b",
  "qwen3:4b",
  "qwen3.5:2b",
  "mistral:latest",
  "llama3.2:3b",
  "hermes3:8b",
];

export function isEmbeddingModel(name: string): boolean {
  const n = name.toLowerCase();
  return EMBEDDING_HINTS.some((h) => n.includes(h));
}

/**
 * `OLLAMA_URL` may hold several addresses, comma or whitespace separated, in
 * the order they should be tried. `OLLAMA_HOST` is accepted for the same job
 * because the old code did.
 */
export function parseOllamaEndpoints(env: Record<string, string | undefined>): string[] {
  const raw = (env.OLLAMA_URL ?? env.OLLAMA_HOST ?? "").trim();
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,\s]+/)) {
    const url = part.trim().replace(/\/+$/, "");
    if (!url) continue;
    // A bare host is not an address we can fetch; require a scheme rather than
    // guessing http and silently talking plaintext to a public endpoint.
    if (!/^https?:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * The model to actually ask for, given what this endpoint has.
 *
 * Returns null when the endpoint holds nothing that can chat — an endpoint
 * with only embedding models is reachable and useless, and saying so lets the
 * caller move to the next one instead of failing the request.
 */
export function pickOllamaModel(
  available: readonly string[],
  preferred: string | undefined,
): string | null {
  const chatable = available.filter((m) => m && !isEmbeddingModel(m));
  if (chatable.length === 0) return null;

  const want = (preferred ?? "").trim();
  if (want) {
    if (chatable.includes(want)) return want;
    // "llama3.1" should accept "llama3.1:8b" — a tag the operator left off is
    // a near miss, not a different model.
    const tagless = chatable.find((m) => m.split(":")[0] === want.split(":")[0]);
    if (tagless) return tagless;
  }

  for (const candidate of PREFERRED_FALLBACKS) {
    if (chatable.includes(candidate)) return candidate;
  }
  // Nothing recognised: take the first that can chat rather than give up.
  return chatable[0];
}

export type OllamaTarget = { url: string; model: string };

/**
 * Walk the endpoints in order and return the first that is up and holds a
 * model we can talk to. `listModels` is injected so this stays testable
 * without a network.
 */
export async function resolveOllamaTarget(
  endpoints: readonly string[],
  preferred: string | undefined,
  listModels: (url: string) => Promise<string[] | null>,
): Promise<OllamaTarget | null> {
  for (const url of endpoints) {
    const models = await listModels(url);
    if (!models) continue; // endpoint down — try the next
    const model = pickOllamaModel(models, preferred);
    if (model) return { url, model };
  }
  return null;
}
