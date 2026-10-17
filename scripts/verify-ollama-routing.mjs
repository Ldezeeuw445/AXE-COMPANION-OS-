/**
 * The free fallback was reachable and unusable.
 *
 * Measured 2026-10-17: `ollama.axecompanion.com` answers /api/tags with twelve
 * models, none of them `qwen3:4b` — the router's default. ollamaHealth() asked
 * that endpoint, got 200, and returned true, so /api/debug/chat-health
 * reported `ok_ollama` while every actual chat came back
 * `{"error":"model 'qwen3:4b' not found"}` and silently fell through to
 * OpenAI. A green check that means nothing is the failure this whole audit is
 * about, so it gets checks of its own.
 *
 * The model lists in the fixture are real responses from both endpoints.
 *
 * Run: node scripts/verify-ollama-routing.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  isEmbeddingModel,
  parseOllamaEndpoints,
  pickOllamaModel,
  resolveOllamaTarget,
} from "../src/lib/llm/ollamaEndpoints.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}
async function acheck(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const fx = JSON.parse(readFileSync("scripts/fixtures/ollama-endpoints-2026-10-17.json", "utf8"));
const SERVER = "https://ollama.axecompanion.com";
const MAC = "https://ollama.tradingosapp.com";
const client = readFileSync("src/lib/llm/ollamaClient.ts", "utf8");

console.log("ollama routing");

check("the bug that started this: the default model is not on the server", () => {
  assert.ok(
    !fx.endpoints[SERVER].includes("qwen3:4b"),
    "fixture no longer reproduces the bug — re-measure before trusting it",
  );
  // And the resolver must not ask for it anyway.
  const picked = pickOllamaModel(fx.endpoints[SERVER], "qwen3:4b");
  assert.ok(fx.endpoints[SERVER].includes(picked), `picked ${picked}, which that endpoint does not have`);
});

check("the configured model is used when it IS there", () => {
  assert.equal(pickOllamaModel(fx.endpoints[MAC], "qwen3:4b"), "qwen3:4b");
  assert.equal(pickOllamaModel(fx.endpoints[MAC], "gemma4:latest"), "gemma4:latest");
});

check("a missing tag is a near miss, not a different model", () => {
  // An operator writing "llama3.1" means the llama3.1 they have.
  assert.equal(pickOllamaModel(["llama3.1:8b", "mistral:latest"], "llama3.1"), "llama3.1:8b");
});

check("an embedding model is never chosen to chat with", () => {
  for (const m of ["nomic-embed-text:latest", "bge-m3:latest"]) {
    assert.ok(isEmbeddingModel(m), `${m} should be recognised as an embedding model`);
  }
  // An endpoint holding only embedders is reachable and useless; say so, so
  // the caller moves on instead of posting a chat to it.
  assert.equal(pickOllamaModel(["nomic-embed-text:latest", "bge-m3:latest"], "qwen3:4b"), null);
  assert.ok(!isEmbeddingModel(pickOllamaModel(fx.endpoints[MAC], "nothing-here")));
});

check("with nothing configured, a known-good chat model wins", () => {
  const picked = pickOllamaModel(fx.endpoints[SERVER], undefined);
  assert.equal(picked, "llama3.1:8b", "a general instruct model, not a coder or an embedder");
});

check("several endpoints can be configured, in order", () => {
  assert.deepEqual(parseOllamaEndpoints({ OLLAMA_URL: `${SERVER}, ${MAC}` }), [SERVER, MAC]);
  assert.deepEqual(parseOllamaEndpoints({ OLLAMA_URL: `${SERVER}\n${MAC}/` }), [SERVER, MAC]);
  assert.deepEqual(parseOllamaEndpoints({ OLLAMA_HOST: SERVER }), [SERVER], "OLLAMA_HOST still works");
  assert.deepEqual(
    parseOllamaEndpoints({ OLLAMA_URL: "  ", OLLAMA_HOST: SERVER }),
    [SERVER],
    "an empty OLLAMA_URL must not shadow OLLAMA_HOST",
  );
  assert.deepEqual(parseOllamaEndpoints({}), []);
  // A bare host would be fetched over plaintext by accident; refuse it.
  assert.deepEqual(parseOllamaEndpoints({ OLLAMA_URL: "ollama.axecompanion.com" }), []);
  // The same address twice is one endpoint, not two attempts.
  assert.deepEqual(parseOllamaEndpoints({ OLLAMA_URL: `${SERVER},${SERVER}/` }), [SERVER]);
});

await acheck("a sleeping Mac Mini falls through to the always-on server", async () => {
  const list = async (url) => (url === MAC ? null : fx.endpoints[SERVER]);
  const t = await resolveOllamaTarget([MAC, SERVER], "qwen3:4b", list);
  assert.equal(t.url, SERVER);
  assert.ok(fx.endpoints[SERVER].includes(t.model));
});

await acheck("the Mac Mini is preferred when it is awake", async () => {
  const list = async (url) => fx.endpoints[url] ?? null;
  const t = await resolveOllamaTarget([MAC, SERVER], "gemma4:latest", list);
  assert.deepEqual(t, { url: MAC, model: "gemma4:latest" });
});

await acheck("everything down is null, not a wrong answer", async () => {
  assert.equal(await resolveOllamaTarget([MAC, SERVER], "x", async () => null), null);
});

check("health now means a chat would work", () => {
  assert.ok(
    /ollamaHealth[\s\S]{0,200}await ollamaTarget\(\)\) !== null/.test(client),
    "health must resolve a usable target, not just ping /api/tags",
  );
  assert.ok(
    !/fetch\(`\$\{baseUrl\(\)\}/.test(client),
    "no call may still use the single hardcoded address",
  );
});

check("a chat with no usable model fails loudly instead of posting nowhere", () => {
  const hits = client.match(/if \(!target\) throw new Error\("Ollama: no endpoint has a usable chat model"\)/g) ?? [];
  assert.equal(hits.length, 2, "both chat paths must guard");
  assert.ok(/model: target\.model/.test(client), "the resolved model is what gets asked for");
});

check("thinking models are told not to think", () => {
  // qwen3:4b put everything in `thinking` and returned content:"" with
  // done_reason:"length". Ollama ignores this flag on models that cannot
  // think, so it is safe to send on every call.
  const hits = client.match(/think: false,/g) ?? [];
  assert.equal(hits.length, 2, "both the streaming and non-streaming call must send it");
});

check("an empty reply is a failure, not an answer", () => {
  assert.ok(
    /Ollama returned an empty reply from \$\{target\.model\}/.test(client),
    "returning '' would render a blank message instead of falling back",
  );
  assert.ok(/if \(!content \|\| !content\.trim\(\)\)/.test(client), "whitespace counts as empty");
});

check("a Cloudflare 524 is named, not swallowed by a JSON parse", () => {
  // Measured: a cold 4.9GB model load through the proxied hostname took 125s
  // and came back as HTML with status 524. res.json() on that throws
  // something unreadable.
  assert.ok(/res\.status === 524/.test(client), "524 needs its own message");
  assert.ok(/Cloudflare 524/.test(client), "and must say whose timeout it was");
});

check("we give up before Cloudflare does", () => {
  // The proxy cuts a request at ~100s. Failing at 90 leaves the router time
  // to fall back instead of inheriting an HTML error page.
  assert.ok(/AbortSignal\.timeout\(90_000\)/.test(client), "non-streaming must abort under 100s");
});

const health = readFileSync("src/app/api/debug/chat-health/route.ts", "utf8");
const healthCode = health.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const router = readFileSync("src/lib/llm/llmRouter.ts", "utf8");

check("chat-health uses the same resolver as the router", () => {
  assert.ok(/parseOllamaEndpoints/.test(health), "health must parse the same env");
  assert.ok(/ollamaTarget\(true\)/.test(health), "reachable means a chat would work");
  assert.ok(/parseOllamaEndpoints\(process\.env\)/.test(router), "the router must use the same parser");
  assert.ok(
    !/OLLAMA_BASE_URL/.test(healthCode),
    "the old health check read OLLAMA_BASE_URL; the router never did",
  );
});

check("anonymous chat-health does not leak URLs or error text", () => {
  assert.ok(/hasCronSecret\(request\.headers\)/.test(health), "detail is behind CRON_SECRET");
  const gate = health.indexOf("if (!hasCronSecret");
  const publicStart = health.indexOf("return NextResponse.json", gate);
  const authedStart = health.indexOf("return NextResponse.json", publicStart + 1);
  const publicReturn = health.slice(publicStart, authedStart);
  assert.ok(publicStart > 0 && authedStart > publicStart, "public and authed payloads must be separate returns");
  assert.ok(/ollama: \{ configured:/.test(publicReturn), "public payload is booleans only");
  assert.ok(!/ollama_endpoints/.test(publicReturn), "endpoint URLs stay off the public payload");
  assert.ok(!/ollama_resolved/.test(publicReturn), "resolved host/model stay off the public payload");
  assert.ok(/ollama_endpoints/.test(health.slice(authedStart)), "authed payload may name the resolved host");
});

console.log(`\n${passed} checks passed`);
