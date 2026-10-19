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
export function parseOllamaEndpoints(env: {
  [key: string]: string | undefined;
}): string[] {
  // Empty-but-present OLLAMA_URL must not shadow OLLAMA_HOST (same class of
  // bug as firstNonEmptyEnv: `??` only falls through on null/undefined).
  let raw = "";
  for (const name of ["OLLAMA_URL", "OLLAMA_HOST"] as const) {
    const value = env[name];
    if (typeof value === "string" && value.trim()) {
      raw = value.trim();
      break;
    }
  }
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

/* ── credentials ───────────────────────────────────────────────────────────
   An endpoint that is open to the internet is one `/api/delete` away from
   losing its models, so both of ours are now shut: the IONOS one behind nginx
   basic auth, the Mac Mini behind Cloudflare Access on its tunnel.

   The apps have to carry the matching credential or the protection reads, from
   the router's side, exactly like a server that is down — which is the quiet
   failure this whole file exists to stop. Both header sets are sent to every
   endpoint: Access ignores an Authorization header it does not need, and nginx
   ignores the CF-Access ones.
   ───────────────────────────────────────────────────────────────────────── */

/** `user:password`, base64 for a Basic header. No Buffer: this file is DOM-free. */
function toBase64(value: string): string {
  if (typeof btoa === "function") return btoa(value);
  // Node before btoa was global, and the verify scripts.
  return (globalThis as { Buffer?: { from(v: string, e: string): { toString(e: string): string } } })
    .Buffer!.from(value, "utf8")
    .toString("base64");
}

export function ollamaAuthHeaders(env: Record<string, string | undefined>): Record<string, string> {
  const headers: Record<string, string> = {};

  const id = (env.OLLAMA_CF_ACCESS_CLIENT_ID ?? "").trim();
  const secret = (env.OLLAMA_CF_ACCESS_CLIENT_SECRET ?? "").trim();
  // Half a service token is not a service token; sending one header alone just
  // produces a confusing 403 rather than an obvious misconfiguration.
  if (id && secret) {
    headers["CF-Access-Client-Id"] = id;
    headers["CF-Access-Client-Secret"] = secret;
  }

  const basic = (env.OLLAMA_BASIC_AUTH ?? "").trim();
  if (basic.includes(":")) headers.Authorization = `Basic ${toBase64(basic)}`;

  return headers;
}

export type OllamaTarget = { url: string; model: string };

/**
 * Why an endpoint was not used. `unauthorized` is the one worth separating:
 * it means the server is alive and refusing us, which is a credential to fix,
 * not a host to wait for.
 */
export type OllamaEndpointStatus =
  | "ok"
  | "unauthorized"
  | "unreachable"
  | "no-chat-model";

export type OllamaEndpointReport = {
  url: string;
  status: OllamaEndpointStatus;
  /** The model that would be used, when status is "ok". */
  model?: string;
  /** How many models the endpoint listed, when it answered at all. */
  models?: number;
};

export type OllamaProbe = { models: string[] | null; status: OllamaEndpointStatus };

export type OllamaResolution = {
  target: OllamaTarget | null;
  endpoints: OllamaEndpointReport[];
};

/**
 * Walk the endpoints in order and return the first that is up and holds a
 * model we can talk to, plus a line about each one that did not work.
 *
 * Returning the reasons is the point: before this, a 401 from an endpoint we
 * had just put behind basic auth looked identical to a server that was off,
 * so the router silently used only the other one and nothing said why.
 *
 * `probe` is injected so this stays testable without a network.
 */
export async function resolveOllamaEndpoints(
  endpoints: readonly string[],
  preferred: string | undefined,
  probe: (url: string) => Promise<OllamaProbe>,
): Promise<OllamaResolution> {
  const reports: OllamaEndpointReport[] = [];
  let target: OllamaTarget | null = null;

  for (const url of endpoints) {
    if (target) break; // the rest are untried, not broken; do not report on them
    const { models, status } = await probe(url);
    if (!models) {
      reports.push({ url, status });
      continue;
    }
    const model = pickOllamaModel(models, preferred);
    if (!model) {
      reports.push({ url, status: "no-chat-model", models: models.length });
      continue;
    }
    reports.push({ url, status: "ok", model, models: models.length });
    target = { url, model };
  }

  return { target, endpoints: reports };
}

/** The older shape, kept for callers that only need the answer. */
export async function resolveOllamaTarget(
  endpoints: readonly string[],
  preferred: string | undefined,
  listModels: (url: string) => Promise<string[] | null>,
): Promise<OllamaTarget | null> {
  const { target } = await resolveOllamaEndpoints(endpoints, preferred, async (url) => {
    const models = await listModels(url);
    return { models, status: models ? "ok" : "unreachable" };
  });
  return target;
}
