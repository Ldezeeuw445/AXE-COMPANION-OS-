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
  ollamaAuthHeaders,
  resolveOllamaEndpoints,
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

/**
 * check() counts the moment fn() returns, so a check that returns a promise
 * would print "ok" before its assertions ran and only surface as an unhandled
 * rejection afterwards. Anything async goes through this instead.
 */
async function checkAsync(name, fn) {
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

/* ── credentials, and saying so when they are wrong ──────────────────────
   Both endpoints are shut now: the IONOS one behind nginx basic auth, the Mac
   Mini behind Cloudflare Access on its tunnel. Measured 2026-10-17,
   `https://ollama.axecompanion.com/api/tags` answered 401 from
   nginx/1.24.0 — and to the old resolver a 401 looked exactly like a host
   that was off, so the router silently used one endpoint and nothing said
   why. */

check("a service token becomes the two Cloudflare Access headers", () => {
  const h = ollamaAuthHeaders({
    OLLAMA_CF_ACCESS_CLIENT_ID: "abc.access",
    OLLAMA_CF_ACCESS_CLIENT_SECRET: "shhh",
  });
  assert.equal(h["CF-Access-Client-Id"], "abc.access");
  assert.equal(h["CF-Access-Client-Secret"], "shhh");
});

check("half a service token sends nothing", () => {
  // One header alone produces a 403 that reads like a policy problem rather
  // than the missing half it actually is.
  assert.deepEqual(ollamaAuthHeaders({ OLLAMA_CF_ACCESS_CLIENT_ID: "abc.access" }), {});
  assert.deepEqual(ollamaAuthHeaders({ OLLAMA_CF_ACCESS_CLIENT_SECRET: "shhh" }), {});
  assert.deepEqual(ollamaAuthHeaders({}), {});
  assert.deepEqual(ollamaAuthHeaders({ OLLAMA_CF_ACCESS_CLIENT_ID: "   " }), {});
});

check("basic auth is encoded, and only when it is a pair", () => {
  const h = ollamaAuthHeaders({ OLLAMA_BASIC_AUTH: "axe:hunter2" });
  assert.equal(h.Authorization, `Basic ${Buffer.from("axe:hunter2", "utf8").toString("base64")}`);
  // No colon means somebody pasted half of it; a malformed header is worse
  // than none, because nginx answers 401 either way and the env looks set.
  assert.equal(ollamaAuthHeaders({ OLLAMA_BASIC_AUTH: "axe" }).Authorization, undefined);
});

check("both credentials can be sent at once", () => {
  // Two endpoints, two mechanisms. Access ignores an Authorization header it
  // does not need; nginx ignores the CF-Access ones.
  const h = ollamaAuthHeaders({
    OLLAMA_CF_ACCESS_CLIENT_ID: "abc.access",
    OLLAMA_CF_ACCESS_CLIENT_SECRET: "shhh",
    OLLAMA_BASIC_AUTH: "axe:hunter2",
  });
  assert.equal(Object.keys(h).length, 3);
});

check("the client sends them on every call, not just the probe", () => {
  const client = readFileSync(new URL("../src/lib/llm/ollamaClient.ts", import.meta.url), "utf8");
  // /api/tags, /api/chat and the streaming /api/chat: three places, and the
  // probe passing while the chat 401s would be the same bug one layer down.
  const uses = client.match(/ollamaAuthHeaders\(process\.env\)/g) ?? [];
  assert.equal(uses.length, 3, `expected 3 authed fetches, found ${uses.length}`);
});

await checkAsync("a refusal is reported as a refusal, not as a dead host", async () => {
  const probes = {
    "https://closed.example": { models: null, status: "unauthorized" },
    "https://down.example": { models: null, status: "unreachable" },
  };
  await resolveOllamaEndpoints(
    Object.keys(probes),
    "llama3.1:8b",
    async (url) => probes[url],
  ).then((res) => {
    assert.equal(res.target, null);
    assert.deepEqual(
      res.endpoints.map((e) => e.status),
      ["unauthorized", "unreachable"],
      "the two must stay apart: one is a credential to fix, the other a host to wait for",
    );
  });
});

await checkAsync("the first endpoint that works wins, and the rest stay untried", async () => {
  const seen = [];
  await resolveOllamaEndpoints(
    ["https://a.example", "https://b.example", "https://c.example"],
    "llama3.1:8b",
    async (url) => {
      seen.push(url);
      return url === "https://a.example"
        ? { models: null, status: "unauthorized" }
        : { models: ["llama3.1:8b"], status: "ok" };
    },
  ).then((res) => {
    assert.equal(res.target.url, "https://b.example");
    assert.deepEqual(seen, ["https://a.example", "https://b.example"], "c must not be probed");
    // An endpoint nobody tried is not an endpoint that failed.
    assert.deepEqual(res.endpoints.map((e) => e.url), ["https://a.example", "https://b.example"]);
  });
});

await checkAsync("an endpoint that answers but holds no chat model says so", async () => {
  await resolveOllamaEndpoints(
    ["https://embeds.example"],
    undefined,
    async () => ({ models: ["nomic-embed-text:latest", "bge-m3:latest"], status: "ok" }),
  ).then((res) => {
    assert.equal(res.target, null);
    assert.equal(res.endpoints[0].status, "no-chat-model");
    assert.equal(res.endpoints[0].models, 2);
  });
});

check("chat-health tells an operator which endpoint refused it", () => {
  const route = readFileSync(
    new URL("../src/app/api/debug/chat-health/route.ts", import.meta.url),
    "utf8",
  );
  assert.ok(route.includes("ollama_endpoint_status"), "report every endpoint, not just the winner");
  assert.ok(
    /refused\.length === endpoints\.length/.test(route),
    "all endpoints refusing is a credential problem and must say so",
  );
  assert.ok(
    route.includes("OLLAMA_BASIC_AUTH / OLLAMA_CF_ACCESS_"),
    "name the variables to fix, not just the symptom",
  );
  // The anonymous half must stay anonymous: no URLs, no credentials.
  const anon = route.slice(route.indexOf("if (!hasCronSecret"), route.indexOf("return NextResponse.json(\n    {\n      status,\n      env:"));
  assert.ok(!/ollama_endpoints|ollama_resolved|CLIENT_SECRET/.test(anon), "the public answer must not leak the setup");
  assert.ok(/refused: refused\.length > 0/.test(anon), "but it may say a credential is the problem");
});

console.log(`\n${passed} checks passed`);
