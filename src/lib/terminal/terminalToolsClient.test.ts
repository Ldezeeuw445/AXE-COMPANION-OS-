import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  AXE_TOOL_SOURCE_COMPANION,
  COMPANION_READONLY_CATALOG_COUNT,
  FALLBACK_READONLY_AXE_TOOLS,
  FALLBACK_READONLY_TOOL_NAMES,
  PHASE1_WRITE_DENYLIST,
  TerminalToolsClient,
  buildTerminalToolsPrompt,
  companionToolName,
  engineToolName,
  isCompanionTerminalTool,
  isInnerAxeToolUnavailable,
  isServiceRoleJwt,
  terminalStatusLabel,
  toOpenAiTerminalTools,
  unwrapInvokeEnvelope,
} from "./terminalToolsClient.ts";

const PREV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PREV_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PREV_PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const PREV_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

afterEach(() => {
  restoreEnv("NEXT_PUBLIC_SUPABASE_URL", PREV_URL);
  restoreEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", PREV_ANON);
  restoreEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY", PREV_PUB);
  restoreEnv("SUPABASE_SERVICE_ROLE_KEY", PREV_SERVICE);
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function jwtWith(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

const USER_JWT = jwtWith({ sub: "user-1", role: "authenticated" });
const SERVICE_JWT = jwtWith({ sub: "user-1", role: "service_role" });

const PROXY_URL = "https://pqnngpcgbdwxavbatbia.supabase.co/functions/v1/engine-proxy";

const PHASE1_NEW_TOOLS = [
  "get_macro_series",
  "list_macro_series",
  "get_big_mac_index",
  "describe_terminal",
  "get_intel_feed",
  "get_news",
  "get_symbol_context",
  "get_scanner",
  "get_earnings_calendar",
  "get_polymarket",
  "get_daily_briefing",
] as const;

type Captured = { url: string; init: RequestInit; body: Record<string, unknown> };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function clientWithFetch(
  fetchImpl: typeof fetch,
  extra?: { now?: () => number; cacheTtlMs?: number; invokeTimeoutMs?: number; listTimeoutMs?: number },
) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://pqnngpcgbdwxavbatbia.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-public-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "super-secret-service-role";
  return new TerminalToolsClient({
    fetch: fetchImpl,
    now: extra?.now,
    cacheTtlMs: extra?.cacheTtlMs,
    invokeTimeoutMs: extra?.invokeTimeoutMs,
    listTimeoutMs: extra?.listTimeoutMs,
  });
}

function captureFetch(handler: (captured: Captured) => Response | Promise<Response>) {
  const calls: Captured[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const raw = String(init?.body ?? "");
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const captured: Captured = { url, init: init ?? {}, body };
    calls.push(captured);
    return handler(captured);
  };
  return { fetchImpl, calls };
}

const MACRO_ENTRY = {
  name: "get_macro_series",
  description: "Read one FRED macro series (engine-proxy macroSeries).",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["key"],
    properties: {
      key: { type: "string" },
      range: { type: "string", enum: ["1M", "3M", "6M", "1Y", "5Y", "ALL"] },
    },
  },
  readOnly: true,
  app: "shared",
  category: "macro",
};

describe("terminal tool naming", () => {
  it("prefixes engine names for the Companion chat loop", () => {
    assert.equal(companionToolName("inspect_chart"), "terminal_inspect_chart");
    assert.equal(companionToolName("terminal_inspect_chart"), "terminal_inspect_chart");
  });

  it("strips the Companion prefix before invokeAxeTool", () => {
    assert.equal(engineToolName("terminal_inspect_chart"), "inspect_chart");
    assert.equal(engineToolName("inspect_chart"), "inspect_chart");
  });

  it("detects Companion terminal tools", () => {
    assert.equal(isCompanionTerminalTool("terminal_describe_terminal"), true);
    assert.equal(isCompanionTerminalTool("get_live_price"), false);
  });
});

describe("JWT fail-closed", () => {
  it("treats service_role tokens as forbidden", () => {
    assert.equal(isServiceRoleJwt(SERVICE_JWT), true);
    assert.equal(isServiceRoleJwt(USER_JWT), false);
    assert.equal(isServiceRoleJwt("not-a-jwt"), false);
  });
});

describe("listAxeTools", () => {
  it("sends source:'companion' with the user JWT and never the service role", async () => {
    const { fetchImpl, calls } = captureFetch(() =>
      jsonResponse(200, { ok: true, data: [MACRO_ENTRY] }),
    );
    const client = clientWithFetch(fetchImpl);
    const listed = await client.listReadOnlyTools({ userId: "user-1", accessToken: USER_JWT });
    assert.equal(listed.source, "engine-proxy");
    assert.equal(listed.available, true);
    assert.equal(listed.tools.length, 1);
    assert.equal(listed.tools[0]?.name, "get_macro_series");
    assert.equal(listed.tools[0]?.readOnly, true);
    assert.equal(listed.tools[0]?.app, "shared");
    assert.equal(listed.tools[0]?.category, "macro");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, PROXY_URL);
    assert.equal(calls[0]?.body.action, "listAxeTools");
    assert.deepEqual(calls[0]?.body.args, { source: AXE_TOOL_SOURCE_COMPANION });
    assert.equal(AXE_TOOL_SOURCE_COMPANION, "companion");
    const headers = calls[0]?.init.headers as Record<string, string>;
    assert.equal(headers.Authorization, `Bearer ${USER_JWT}`);
    assert.equal(headers.apikey, "anon-public-key");
    assert.doesNotMatch(JSON.stringify(calls[0]), /super-secret-service-role/);
    assert.notEqual(headers.Authorization, "Bearer super-secret-service-role");
  });

  it("parses the canonical bare data array with name, description, parameters, readOnly, app, category", async () => {
    const { fetchImpl } = captureFetch(() =>
      jsonResponse(200, {
        ok: true,
        data: [
          {
            name: "get_news",
            description: "Market headlines",
            parameters: { type: "object", properties: { symbol: { type: "string" } } },
            readOnly: true,
            app: "shared",
            category: "news",
          },
        ],
      }),
    );
    const listed = await clientWithFetch(fetchImpl).listReadOnlyTools({
      userId: "user-1",
      accessToken: USER_JWT,
    });
    assert.deepEqual(listed.tools[0], {
      name: "get_news",
      description: "Market headlines",
      parameters: { type: "object", properties: { symbol: { type: "string" } } },
      readOnly: true,
      app: "shared",
      category: "news",
    });
  });

  it("still accepts a wrapped {tools:[]} payload as robustness", async () => {
    const { fetchImpl } = captureFetch(() =>
      jsonResponse(200, {
        ok: true,
        data: {
          tools: [
            {
              type: "function",
              function: {
                name: "describe_terminal",
                description: "Summarise what the terminal currently shows",
                parameters: { type: "object", properties: {} },
              },
              readOnly: true,
              app: "shared",
              category: "terminal",
            },
          ],
        },
      }),
    );
    const listed = await clientWithFetch(fetchImpl).listReadOnlyTools({
      userId: "user-1",
      accessToken: USER_JWT,
    });
    assert.equal(listed.tools[0]?.name, "describe_terminal");
    assert.equal(listed.tools[0]?.readOnly, true);
    assert.equal(listed.tools[0]?.app, "shared");
    assert.equal(listed.tools[0]?.category, "terminal");
  });

  it("drops tools that are not marked readOnly, including known writes", async () => {
    const { fetchImpl } = captureFetch(() =>
      jsonResponse(200, {
        ok: true,
        data: [
          { name: "inspect_account", description: "account", parameters: {}, readOnly: true, app: "shared", category: "account" },
          { name: "inspect_risk", description: "risk", parameters: {}, app: "shared", category: "risk" },
          { name: "set_price_alert", description: "alert", parameters: {}, readOnly: true, app: "trading-os", category: "alerts" },
          { name: "create_journal_note", description: "note", parameters: {}, readOnly: false, app: "trading-os", category: "journal" },
          { name: "retrieve_memory", description: "memory", parameters: {}, readOnly: true, app: "shared", category: "memory" },
        ],
      }),
    );
    const listed = await clientWithFetch(fetchImpl).listReadOnlyTools({
      userId: "user-1",
      accessToken: USER_JWT,
    });
    const names = listed.tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["inspect_account", "retrieve_memory"]);
    for (const write of PHASE1_WRITE_DENYLIST) {
      assert.equal(names.includes(write), false);
    }
  });

  it("falls back to the static read-only catalog when listAxeTools is missing", async () => {
    const { fetchImpl, calls } = captureFetch(() =>
      jsonResponse(400, { ok: false, error: "unknown_action" }),
    );
    const listed = await clientWithFetch(fetchImpl).listReadOnlyTools({
      userId: "user-1",
      accessToken: USER_JWT,
    });
    assert.equal(listed.source, "fallback");
    assert.equal(listed.available, true);
    assert.deepEqual(listed.tools.map((t) => t.name).sort(), [...FALLBACK_READONLY_TOOL_NAMES].sort());
    for (const name of PHASE1_NEW_TOOLS) {
      assert.equal(listed.tools.some((t) => t.name === name), true, `fallback missing ${name}`);
    }
    assert.equal(listed.tools.some((t) => t.name === "inspect_chart"), true);
    assert.equal(listed.tools.some((t) => t.name === "retrieve_memory"), true);
    assert.equal(listed.tools.some((t) => t.name === "set_price_alert"), false);
    assert.equal(listed.tools.some((t) => t.name === "create_journal_note"), false);
    assert.equal(listed.tools.every((t) => t.readOnly === true), true);
    assert.equal(listed.tools.every((t) => typeof t.category === "string" && t.category.length > 0), true);
    assert.equal(listed.tools.length, COMPANION_READONLY_CATALOG_COUNT);
    assert.equal(FALLBACK_READONLY_AXE_TOOLS.length, COMPANION_READONLY_CATALOG_COUNT);
    assert.equal(calls[0]?.body.action, "listAxeTools");
    assert.deepEqual(calls[0]?.body.args, { source: "companion" });
  });

  it("keeps 16 read-only tools when the proxy returns the full 18-tool catalog", async () => {
    const { fetchImpl } = captureFetch(() =>
      jsonResponse(200, {
        ok: true,
        data: [
          ...FALLBACK_READONLY_AXE_TOOLS,
          { name: "set_price_alert", description: "alert", parameters: {}, readOnly: false, app: "trading-os", category: "alerts" },
          { name: "create_journal_note", description: "note", parameters: {}, readOnly: false, app: "trading-os", category: "journal" },
        ],
      }),
    );
    const listed = await clientWithFetch(fetchImpl).listReadOnlyTools({
      userId: "user-1",
      accessToken: USER_JWT,
    });
    assert.equal(listed.tools.length, COMPANION_READONLY_CATALOG_COUNT);
    assert.equal(listed.tools.some((t) => PHASE1_WRITE_DENYLIST.has(t.name)), false);
  });

  it("fallback catalog entries use the TOS field names", () => {
    const macro = FALLBACK_READONLY_AXE_TOOLS.find((t) => t.name === "get_macro_series");
    assert.ok(macro);
    assert.equal(macro.readOnly, true);
    assert.equal(macro.app, "shared");
    assert.equal(macro.category, "macro");
    assert.ok(macro.parameters);
    assert.ok(macro.description);
  });

  it("caches the list for about 10 minutes per process", async () => {
    let now = 1_000_000;
    let hits = 0;
    const { fetchImpl } = captureFetch(() => {
      hits += 1;
      return jsonResponse(200, { ok: true, data: [MACRO_ENTRY] });
    });
    const client = clientWithFetch(fetchImpl, { now: () => now, cacheTtlMs: 10 * 60 * 1000 });
    await client.listReadOnlyTools({ userId: "user-1", accessToken: USER_JWT });
    now += 9 * 60 * 1000;
    await client.listReadOnlyTools({ userId: "user-1", accessToken: USER_JWT });
    assert.equal(hits, 1);
    now += 2 * 60 * 1000;
    await client.listReadOnlyTools({ userId: "user-1", accessToken: USER_JWT });
    assert.equal(hits, 2);
  });

  it("does not cache auth failures — fail-closed, no tools", async () => {
    let hits = 0;
    const { fetchImpl } = captureFetch(() => {
      hits += 1;
      return jsonResponse(401, { ok: false, error: "invalid_token" });
    });
    const client = clientWithFetch(fetchImpl, { now: () => 1, cacheTtlMs: 10 * 60 * 1000 });
    const first = await client.listReadOnlyTools({ userId: "user-1", accessToken: USER_JWT });
    const second = await client.listReadOnlyTools({ userId: "user-1", accessToken: USER_JWT });
    assert.equal(first.available, false);
    assert.equal(first.tools.length, 0);
    assert.equal(second.tools.length, 0);
    assert.equal(hits, 2);
  });

  it("refuses a service-role token without calling engine-proxy", async () => {
    const { fetchImpl, calls } = captureFetch(() => jsonResponse(200, { ok: true, data: [] }));
    const listed = await clientWithFetch(fetchImpl).listReadOnlyTools({
      userId: "user-1",
      accessToken: SERVICE_JWT,
    });
    assert.equal(listed.available, false);
    assert.equal(listed.tools.length, 0);
    assert.equal(calls.length, 0);
  });

  it("refuses an empty token without calling engine-proxy", async () => {
    const { fetchImpl, calls } = captureFetch(() => jsonResponse(200, { ok: true, data: [] }));
    const listed = await clientWithFetch(fetchImpl).listReadOnlyTools({
      userId: "user-1",
      accessToken: "  ",
    });
    assert.equal(listed.available, false);
    assert.equal(calls.length, 0);
  });
});

describe("invokeAxeTool", () => {
  it("sends source:'companion', the user JWT, and the original engine name", async () => {
    const { fetchImpl, calls } = captureFetch((captured) => {
      if (captured.body.action === "listAxeTools") {
        return jsonResponse(400, { ok: false, error: "unknown_action" });
      }
      return jsonResponse(200, {
        ok: true,
        data: {
          ok: true,
          unavailable: false,
          tool: "get_macro_series",
          data: { key: "DGS10", lastUpdated: "2026-11-18T12:00:00.000Z" },
        },
      });
    });
    const client = clientWithFetch(fetchImpl);
    const result = await client.invoke({
      userId: "user-1",
      accessToken: USER_JWT,
      companionName: "terminal_get_macro_series",
      args: { key: "DGS10", range: "1Y" },
      extras: { symbol: "XAUUSD", timeframe: "1H" },
    });
    const invoke = calls.find((c) => c.body.action === "invokeAxeTool");
    assert.ok(invoke);
    assert.deepEqual(invoke.body.args, {
      userId: "user-1",
      name: "get_macro_series",
      args: { key: "DGS10", range: "1Y" },
      source: "companion",
      symbol: "XAUUSD",
      timeframe: "1H",
    });
    const headers = invoke.init.headers as Record<string, string>;
    assert.equal(headers.Authorization, `Bearer ${USER_JWT}`);
    const parsed = JSON.parse(result) as { ok: boolean; unavailable: boolean; tool: string; data: { key: string } };
    assert.equal(parsed.ok, true);
    assert.equal(parsed.unavailable, false);
    assert.equal(parsed.tool, "get_macro_series");
    assert.equal(parsed.data.key, "DGS10");
  });

  it("treats HTTP 200 {ok:true, data:{ok:false, unavailable:true}} as unavailable, never success", async () => {
    const inner = {
      ok: false,
      unavailable: true,
      tool: "get_news",
      field: "news",
      reason: "FMP news error: 502 invalid_key",
      quality: "unavailable",
    };
    const { fetchImpl } = captureFetch((captured) => {
      if (captured.body.action === "listAxeTools") {
        return jsonResponse(400, { ok: false, error: "unknown_action" });
      }
      return jsonResponse(200, { ok: true, data: inner });
    });
    const result = await clientWithFetch(fetchImpl).invoke({
      userId: "user-1",
      accessToken: USER_JWT,
      companionName: "terminal_get_news",
    });
    const parsed = JSON.parse(result) as typeof inner;
    assert.equal(parsed.ok, false);
    assert.equal(parsed.unavailable, true);
    assert.equal(parsed.tool, "get_news");
    assert.equal(parsed.field, "news");
    assert.equal(parsed.reason, "FMP news error: 502 invalid_key");
    assert.equal(parsed.quality, "unavailable");
  });

  it("treats nested write-tool rejection (field:tool) as unavailable, not a successful result", async () => {
    const inner = {
      ok: false,
      unavailable: true,
      tool: "get_macro_series",
      field: "tool",
      reason:
        "Companion may only invoke read-only AXE tools (Phase 1). This tool is not readOnly. Send source:'companion' only for readOnly tools.",
      quality: "unavailable",
    };
    const { fetchImpl } = captureFetch((captured) => {
      if (captured.body.action === "listAxeTools") {
        return jsonResponse(400, { ok: false, error: "unknown_action" });
      }
      return jsonResponse(200, { ok: true, data: inner });
    });
    const result = await clientWithFetch(fetchImpl).invoke({
      userId: "user-1",
      accessToken: USER_JWT,
      companionName: "terminal_get_macro_series",
    });
    const parsed = JSON.parse(result) as typeof inner & { data?: unknown };
    assert.equal(parsed.ok, false);
    assert.equal(parsed.unavailable, true);
    assert.equal(parsed.field, "tool");
    assert.equal(parsed.quality, "unavailable");
    assert.equal("data" in parsed && parsed.data != null && typeof parsed.data === "object" && "ok" in (parsed.data as object), false);
  });

  it("refuses write tools without calling invokeAxeTool and returns the unavailable shape", async () => {
    const { fetchImpl, calls } = captureFetch(() => jsonResponse(200, { ok: true, data: { ok: true } }));
    const client = clientWithFetch(fetchImpl);
    const result = await client.invoke({
      userId: "user-1",
      accessToken: USER_JWT,
      companionName: "terminal_set_price_alert",
      args: { symbol: "XAUUSD", condition: "price_above", price: 2400 },
    });
    const parsed = JSON.parse(result) as {
      ok: boolean;
      unavailable: boolean;
      tool: string;
      field: string;
      reason: string;
      quality: string;
    };
    assert.equal(parsed.ok, false);
    assert.equal(parsed.unavailable, true);
    assert.equal(parsed.tool, "set_price_alert");
    assert.equal(parsed.field, "tool");
    assert.equal(parsed.quality, "unavailable");
    assert.match(parsed.reason, /read-only/i);
    assert.match(parsed.reason, /source:'companion'/);
    assert.equal(calls.some((c) => c.body.action === "invokeAxeTool"), false);
  });

  it("returns a terminal-unavailable payload on timeout and does not throw", async () => {
    const { fetchImpl } = captureFetch(async (captured) => {
      if (captured.body.action === "listAxeTools") {
        return jsonResponse(400, { ok: false, error: "unknown_action" });
      }
      await new Promise((resolve) => setTimeout(resolve, 80));
      return jsonResponse(200, { ok: true, data: { ok: true, tool: "inspect_account", data: {} } });
    });
    const client = clientWithFetch(fetchImpl, { invokeTimeoutMs: 20 });
    const result = await client.invoke({
      userId: "user-1",
      accessToken: USER_JWT,
      companionName: "terminal_inspect_account",
    });
    const parsed = JSON.parse(result) as { ok: boolean; unavailable: boolean; reason: string; field: string };
    assert.equal(parsed.ok, false);
    assert.equal(parsed.unavailable, true);
    assert.equal(parsed.field, "terminal");
    assert.match(parsed.reason, /timeout|unavailable/i);
  });

  it("returns a terminal-unavailable payload on engine-proxy errors and does not throw", async () => {
    const { fetchImpl } = captureFetch((captured) => {
      if (captured.body.action === "listAxeTools") {
        return jsonResponse(400, { ok: false, error: "unknown_action" });
      }
      return jsonResponse(500, { ok: false, error: "boom" });
    });
    const result = await clientWithFetch(fetchImpl).invoke({
      userId: "user-1",
      accessToken: USER_JWT,
      companionName: "terminal_retrieve_history",
    });
    const parsed = JSON.parse(result) as { ok: boolean; unavailable: boolean; reason: string };
    assert.equal(parsed.ok, false);
    assert.equal(parsed.unavailable, true);
    assert.match(parsed.reason, /unavailable|boom/i);
  });

  it("scopes invoke to the caller userId from auth, not from tool args", async () => {
    const { fetchImpl, calls } = captureFetch((captured) => {
      if (captured.body.action === "listAxeTools") {
        return jsonResponse(400, { ok: false, error: "unknown_action" });
      }
      return jsonResponse(200, {
        ok: true,
        data: { ok: true, unavailable: false, tool: "inspect_risk", data: {} },
      });
    });
    await clientWithFetch(fetchImpl).invoke({
      userId: "user-1",
      accessToken: USER_JWT,
      companionName: "terminal_inspect_risk",
      args: { userId: "someone-else", accountId: "acc-9", source: "trading-os" },
    });
    const invoke = calls.find((c) => c.body.action === "invokeAxeTool");
    const args = invoke?.body.args as Record<string, unknown>;
    assert.equal(args.userId, "user-1");
    assert.equal(args.source, "companion");
    assert.equal((args.args as Record<string, unknown>).userId, undefined);
    assert.equal((args.args as Record<string, unknown>).source, undefined);
    assert.equal((args.args as Record<string, unknown>).accountId, "acc-9");
  });
});

describe("nested invoke envelope (TOS commit 2601e3e)", () => {
  const WRITE_REJECTION = {
    ok: false,
    unavailable: true,
    tool: "set_price_alert",
    field: "tool",
    reason:
      "Companion may only invoke read-only AXE tools (Phase 1). This tool is not readOnly. Send source:'companion' only for readOnly tools.",
    quality: "unavailable",
  } as const;

  it("does not treat top-level ok:true as success when data.ok is false", () => {
    const raw = unwrapInvokeEnvelope("set_price_alert", { ok: true, data: WRITE_REJECTION });
    const parsed = JSON.parse(raw) as typeof WRITE_REJECTION;
    assert.equal(isInnerAxeToolUnavailable(WRITE_REJECTION), true);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.unavailable, true);
    assert.equal(parsed.tool, "set_price_alert");
    assert.equal(parsed.field, "tool");
    assert.equal(parsed.reason, WRITE_REJECTION.reason);
    assert.equal(parsed.quality, "unavailable");
  });

  it("treats data.unavailable === true as unavailable even if data.ok is missing", () => {
    const raw = unwrapInvokeEnvelope("get_news", {
      ok: true,
      data: { unavailable: true, tool: "get_news", field: "news", reason: "empty feed" },
    });
    const parsed = JSON.parse(raw) as { ok: boolean; unavailable: boolean; reason: string };
    assert.equal(parsed.ok, false);
    assert.equal(parsed.unavailable, true);
    assert.equal(parsed.reason, "empty feed");
  });

  it("treats data.ok === false as unavailable even if data.unavailable is missing", () => {
    const raw = unwrapInvokeEnvelope("get_scanner", {
      ok: true,
      data: { ok: false, tool: "get_scanner", field: "scanner", reason: "FMP invalid_key" },
    });
    const parsed = JSON.parse(raw) as { ok: boolean; unavailable: boolean; field: string };
    assert.equal(parsed.ok, false);
    assert.equal(parsed.unavailable, true);
    assert.equal(parsed.field, "scanner");
  });

  it("keeps top-level {ok:false} as a transport error", () => {
    const raw = unwrapInvokeEnvelope("inspect_chart", { ok: false, error: "boom" });
    const parsed = JSON.parse(raw) as { ok: boolean; unavailable: boolean; field: string; reason: string };
    assert.equal(parsed.ok, false);
    assert.equal(parsed.unavailable, true);
    assert.equal(parsed.field, "terminal");
    assert.match(parsed.reason, /boom/);
  });

  it("passes through a nested success {ok:true, unavailable:false}", () => {
    const raw = unwrapInvokeEnvelope("get_macro_series", {
      ok: true,
      data: {
        ok: true,
        unavailable: false,
        tool: "get_macro_series",
        data: { key: "DGS10", value: 4.21 },
      },
    });
    const parsed = JSON.parse(raw) as { ok: boolean; unavailable: boolean; data: { key: string } };
    assert.equal(parsed.ok, true);
    assert.equal(parsed.unavailable, false);
    assert.equal(parsed.data.key, "DGS10");
  });
});

describe("chat merge helpers", () => {
  it("emits OpenAI tools with terminal_ names", () => {
    const tools = toOpenAiTerminalTools([
      {
        name: "inspect_chart",
        description: "Read the active chart",
        parameters: { type: "object", properties: { symbol: { type: "string" } } },
        readOnly: true,
        app: "shared",
        category: "chart",
      },
    ]);
    assert.equal(tools.length, 1);
    assert.equal(tools[0]?.function.name, "terminal_inspect_chart");
    assert.match(tools[0]?.function.description ?? "", /Trading OS/);
  });

  it("routes Dutch terminal questions and Big Mac source/year in the prompt", () => {
    const prompt = buildTerminalToolsPrompt({
      tools: [
        {
          name: "describe_terminal",
          description: "What the terminal shows",
          parameters: { type: "object", properties: {} },
          readOnly: true,
          app: "shared",
          category: "terminal",
        },
        {
          name: "get_big_mac_index",
          description: "Big Mac index",
          parameters: { type: "object", properties: {} },
          readOnly: true,
          app: "shared",
          category: "macro",
        },
      ],
      available: true,
      source: "engine-proxy",
    });
    assert.match(prompt, /kijk in mijn terminal/i);
    assert.match(prompt, /Trading OS/);
    assert.match(prompt, /terminal_describe_terminal/);
    assert.match(prompt, /Big Mac/);
    assert.match(prompt, /source and year|bron en jaar/i);
  });

  it("tells AXE to use Companion tools when the terminal is offline", () => {
    const prompt = buildTerminalToolsPrompt({ tools: [], available: false, source: "fallback" });
    assert.match(prompt, /unavailable|niet bereikbaar|Companion/i);
    assert.doesNotMatch(prompt, /terminal_describe_terminal/);
  });

  it("returns the Dutch terminal status label", () => {
    assert.equal(terminalStatusLabel(["terminal_inspect_chart"]), "kijkt in je terminal…");
    assert.equal(terminalStatusLabel(["get_live_price"]), null);
    assert.equal(terminalStatusLabel(["get_live_price", "terminal_inspect_account"]), "kijkt in je terminal…");
  });
});
