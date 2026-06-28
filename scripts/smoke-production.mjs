#!/usr/bin/env node
/**
 * Production smoke test — run against www.axecompanion.com
 * Usage: node scripts/smoke-production.mjs
 */

const BASE = process.env.SMOKE_BASE_URL || "https://www.axecompanion.com";
const CHAT_TIMEOUT_MS = Number(process.env.SMOKE_CHAT_TIMEOUT_MS) || 180_000;

const results = [];

function pass(name, detail = "") {
  results.push({ name, status: "PASS", detail });
  console.log(`✅ PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, status: "FAIL", detail });
  console.log(`❌ FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

function skip(name, detail = "") {
  results.push({ name, status: "SKIP", detail });
  console.log(`⏭ SKIP  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { res, json, text: text.slice(0, 500) };
}

function getBearerFromCookies(setCookieHeaders) {
  if (!setCookieHeaders?.length) return null;
  const joined = setCookieHeaders.join("; ");
  const m = joined.match(/sb-[^=]+-auth-token=([^;]+)/);
  if (!m) return null;
  try {
    const decoded = decodeURIComponent(m[1]);
    const parsed = JSON.parse(
      decoded.startsWith("base64-")
        ? Buffer.from(decoded.slice(7), "base64").toString("utf8")
        : decoded,
    );
    return parsed?.access_token ?? parsed?.[0]?.access_token ?? null;
  } catch {
    return null;
  }
}

async function parseChatStream(res) {
  const reader = res.body?.getReader();
  if (!reader) return { ok: false, error: "no body" };
  const decoder = new TextDecoder();
  let buf = "";
  let tokens = "";
  let error = null;
  let done = false;

  while (true) {
    const { value, done: rd } = await reader.read();
    if (rd) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const block of parts) {
      if (block.includes("data: [DONE]")) done = true;
      const lines = block.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (!data || data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        if (event === "token" && parsed.text) tokens += parsed.text;
        if (event === "error") error = parsed.message ?? JSON.stringify(parsed);
        if (parsed.type === "token" && parsed.text) tokens += parsed.text;
        if (parsed.type === "error") error = parsed.message;
        if (parsed.type === "done") done = true;
      } catch {
        /* ignore */
      }
    }
  }
  return { ok: !error && tokens.length > 0, tokens: tokens.slice(0, 200), error, done };
}

async function main() {
  console.log(`\n🔍 AXE Companion production smoke test\n   Base: ${BASE}\n`);

  // ── Public endpoints ──────────────────────────────────────────
  {
    const { res, json } = await fetchJson("/api/debug/chat-health");
    if (res.ok && json?.status) pass("chat-health", json.status);
    else fail("chat-health", `${res.status} ${JSON.stringify(json)?.slice(0, 120)}`);
  }

  {
    const { res, json } = await fetchJson("/api/intel-chat");
    if (res.ok && json?.status === "operational") pass("intel-chat health");
    else fail("intel-chat health", String(res.status));
  }

  {
    const { res, json } = await fetchJson("/api/feed");
    if (res.ok && Array.isArray(json?.items)) pass("axe feed", `${json.items.length} items`);
    else fail("axe feed", String(res.status));
  }

  for (const page of ["/chat", "/cockpit", "/vault", "/intel", "/alerts", "/login"]) {
    const res = await fetch(`${BASE}${page}`, { redirect: "follow" });
    if (res.ok || res.status === 307) pass(`page ${page}`, String(res.status));
    else fail(`page ${page}`, String(res.status));
  }

  // ── Demo auth ─────────────────────────────────────────────────
  let cookieHeader = "";
  let bearer = null;

  {
    const res = await fetch(`${BASE}/api/auth/demo`, {
      method: "POST",
      redirect: "manual",
    });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    if (setCookies.length) {
      cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");
      bearer = getBearerFromCookies(setCookies);
    }
    const json = await res.json().catch(() => null);
    if (res.ok && json?.ok) {
      pass("demo auth", `${json.mode} user=${json.userId?.slice(0, 8)}…`);
    } else {
      fail("demo auth", json?.error ?? String(res.status));
      console.log("\n⚠️  Authenticated tests skipped — no demo session\n");
      printSummary();
      process.exit(1);
    }
  }

  const authHeaders = {
    Cookie: cookieHeader,
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    "Content-Type": "application/json",
  };

  // ── Authenticated reads ───────────────────────────────────────
  {
    const { res, json } = await fetchJson("/api/chat/quota", { headers: authHeaders });
    if (res.ok && json?.ok) pass("chat quota", `remaining=${json.remaining}`);
    else fail("chat quota", `${res.status} ${JSON.stringify(json)?.slice(0, 80)}`);
  }

  {
    const { res, json } = await fetchJson("/api/chat/thread", { headers: authHeaders });
    if (res.ok) pass("chat thread (axe)", `${json?.messages?.length ?? 0} msgs`);
    else fail("chat thread (axe)", String(res.status));
  }

  {
    const { res, json } = await fetchJson("/api/chat/thread?type=intel", { headers: authHeaders });
    if (res.ok) pass("chat thread (intel)", `${json?.messages?.length ?? 0} msgs`);
    else fail("chat thread (intel)", String(res.status));
  }

  {
    const { res, json } = await fetchJson("/api/context?symbol=XAUUSD", { headers: authHeaders });
    if (res.ok && json) pass("trading context", json.axe_context ? "has axe_context" : "partial");
    else fail("trading context", String(res.status));
  }

  {
    const { res, json } = await fetchJson("/api/cockpit/briefing", { headers: authHeaders });
    if (res.ok) {
      pass("cockpit briefing GET", json?.brief ? "brief exists" : json?.message ?? "no brief yet");
    } else fail("cockpit briefing GET", `${res.status} ${json?.error ?? ""}`);
  }

  {
    const { res, json } = await fetchJson("/api/alerts", { headers: authHeaders });
    if (res.ok) pass("alerts list", `${Array.isArray(json?.alerts) ? json.alerts.length : 0} alerts`);
    else fail("alerts list", String(res.status));
  }

  {
    const { res, json } = await fetchJson("/api/adaptive/suggestions", { headers: authHeaders });
    if (res.ok) pass("adaptive suggestions", `${json?.suggestions?.length ?? 0} items`);
    else fail("adaptive suggestions", String(res.status));
  }

  {
    const { res, json } = await fetchJson("/api/market/context", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ symbol: "XAUUSD" }),
    });
    if (res.ok) pass("market context");
    else fail("market context", String(res.status));
  }

  // ── Vault save ────────────────────────────────────────────────
  {
    const { res, json } = await fetchJson("/api/vault/save-axe", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        content: `[smoke-test ${new Date().toISOString()}] AXE vault save test`,
        title: "Smoke test note",
        source: "axe",
      }),
    });
    if (res.ok && json?.ok) pass("vault save (axe)");
    else fail("vault save (axe)", `${res.status} ${JSON.stringify(json)?.slice(0, 100)}`);
  }

  {
    const { res, json } = await fetchJson("/api/vault/save-axe", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        content: `[smoke-test ${new Date().toISOString()}] Intel vault save test`,
        title: "Intel smoke test",
        source: "intel",
      }),
    });
    if (res.ok && json?.ok) pass("vault save (intel)");
    else fail("vault save (intel)", `${res.status} ${JSON.stringify(json)?.slice(0, 100)}`);
  }

  // ── Intel correlate (LLM — can be slow) ───────────────────────
  {
    console.log("\n⏳ intel-correlate (LLM, up to 120s)…");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 120_000);
    try {
      const res = await fetch(`${BASE}/api/intel-correlate`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ symbol: "XAUUSD" }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const json = await res.json();
      if (res.ok && json?.ok && json?.correlation?.title) {
        pass("intel-correlate", json.correlation.title.slice(0, 60));
      } else {
        fail("intel-correlate", `${res.status} ${json?.error ?? JSON.stringify(json)?.slice(0, 120)}`);
      }
    } catch (e) {
      clearTimeout(t);
      fail("intel-correlate", e instanceof Error ? e.message : String(e));
    }
  }

  // ── AXE chat stream (LLM — slow on Ollama) ────────────────────
  {
    console.log(`\n⏳ chat/stream AXE (LLM, up to ${CHAT_TIMEOUT_MS / 1000}s)…`);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CHAT_TIMEOUT_MS);
    const start = Date.now();
    try {
      const res = await fetch(`${BASE}/api/chat/stream`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ text: "Say hello in one short sentence.", type: "axe" }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        fail("chat/stream AXE", `HTTP ${res.status}`);
      } else {
        const out = await parseChatStream(res);
        const ms = Date.now() - start;
        if (out.ok) pass("chat/stream AXE", `${ms}ms — "${out.tokens.trim().slice(0, 80)}"`);
        else fail("chat/stream AXE", out.error ?? "empty response");
      }
    } catch (e) {
      clearTimeout(t);
      fail("chat/stream AXE", e instanceof Error ? e.message : String(e));
    }
  }

  // ── Intel chat stream ─────────────────────────────────────────
  {
    console.log(`\n⏳ chat/stream Intel (LLM, up to ${CHAT_TIMEOUT_MS / 1000}s)…`);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CHAT_TIMEOUT_MS);
    const start = Date.now();
    try {
      const res = await fetch(`${BASE}/api/chat/stream`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          text: "Give a one-sentence intel read on gold using available feeds.",
          type: "intel",
          symbol: "XAUUSD",
        }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        fail("chat/stream Intel", `HTTP ${res.status}`);
      } else {
        const out = await parseChatStream(res);
        const ms = Date.now() - start;
        if (out.ok) pass("chat/stream Intel", `${ms}ms — "${out.tokens.trim().slice(0, 80)}"`);
        else fail("chat/stream Intel", out.error ?? "empty response");
      }
    } catch (e) {
      clearTimeout(t);
      fail("chat/stream Intel", e instanceof Error ? e.message : String(e));
    }
  }

  // ── Briefing generate (optional — slow) ───────────────────────
  if (process.env.SMOKE_SKIP_BRIEFING !== "1") {
    console.log("\n⏳ briefing generate (LLM, up to 120s)…");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 120_000);
    try {
      const res = await fetch(`${BASE}/api/cockpit/briefing?force=true`, {
        method: "POST",
        headers: authHeaders,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const json = await res.json();
      if (res.ok && (json?.brief || json?.generated)) {
        pass("briefing generate", json.provider ?? json.model ?? "ok");
      } else {
        fail("briefing generate", `${res.status} ${json?.error ?? JSON.stringify(json)?.slice(0, 100)}`);
      }
    } catch (e) {
      clearTimeout(t);
      fail("briefing generate", e instanceof Error ? e.message : String(e));
    }
  } else {
    skip("briefing generate", "SMOKE_SKIP_BRIEFING=1");
  }

  printSummary();
  const failed = results.filter((r) => r.status === "FAIL").length;
  process.exit(failed > 0 ? 1 : 0);
}

function printSummary() {
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  console.log(`\n${"─".repeat(50)}`);
  console.log(`SUMMARY: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failed) {
    console.log("\nFailed:");
    for (const r of results.filter((x) => x.status === "FAIL")) {
      console.log(`  • ${r.name}: ${r.detail}`);
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
