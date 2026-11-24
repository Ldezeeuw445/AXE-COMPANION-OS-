/**
 * C1 — server-side Trading OS terminal tools client.
 *
 * Trading OS leads. Contract: trading-os-app `docs/axe-tools-contract.md`
 * (PR https://github.com/Ldezeeuw445/trading-os-app/pull/88).
 *
 * POST {SUPABASE_URL}/functions/v1/engine-proxy
 * Headers: Authorization: Bearer <user JWT>, apikey: <anon>
 * Body:    { "action": string, "args": object }
 *
 * listAxeTools (JWT required, not in PUBLIC_ACTIONS; not deployed yet):
 *   Request:
 *     { "action": "listAxeTools", "args": { "source": "companion" } }
 *   Success:
 *     { "ok": true, "data": [{ name, description, parameters, readOnly, app, category }] }
 *   Missing action: HTTP 400 { "ok": false, "error": "unknown_action" }
 *
 * invokeAxeTool (JWT required; args.userId must equal JWT sub):
 *   Request:
 *     {
 *       "action": "invokeAxeTool",
 *       "args": {
 *         "userId": "<jwt sub>",
 *         "name": "get_macro_series",
 *         "args": { ... },
 *         "source": "companion",
 *         "symbol"?: string,
 *         "timeframe"?: string,
 *         "accountId"?: string | null,
 *         "chartState"?: unknown
 *       }
 *     }
 *   engine-proxy always returns HTTP 200 { ok: true, data: inner } for tool
 *   outcomes (TOS commit 2601e3e). Check data.ok / data.unavailable — not only
 *   the top-level ok. Nested failure:
 *     { ok: true, data: { ok: false, unavailable: true, tool, field, reason, quality: "unavailable" } }
 *   AxeToolResult success:
 *     { "ok": true, "unavailable": false, "tool": "<name>", "data": unknown }
 *   Transport errors may still be top-level { ok: false, error }.
 *
 * Companion MUST send source:"companion" exactly. Any other source (omitted,
 * "", "trading-os", …) counts as trading-os and keeps write tools.
 * source:"companion" listAxeTools returns 16 read-only tools (writes filtered).
 */

import { getSupabaseKey } from "../env";

export const COMPANION_TOOL_PREFIX = "terminal_";
export const AXE_TOOL_SOURCE_COMPANION = "companion" as const;
export const LIST_CACHE_TTL_MS = 10 * 60 * 1000;
export const INVOKE_TIMEOUT_MS = 8_000;
export const LIST_TIMEOUT_MS = 8_000;

export const AXE_INTEL_FEED_NAMES = [
  "corporateJets",
  "vesselStream",
  "insiderTrades",
  "whaleTransactions",
  "senateTrades",
  "darkPoolPrints",
  "unusualOptions",
  "marketTide",
  "openSourcesBrief",
  "gdeltCatalysts",
  "gdeltEvents",
  "weatherAlerts",
  "healthAlerts",
  "aviationFlights",
  "marketQuotes",
  "militaryRadar",
  "emergencyMonitor",
  "cyberThreats",
  "energyFlows",
  "vesselTracking",
  "conflictEvents",
  // Crypto perpetuals (OKX funding, open interest, long/short) + CoinGecko totals and trending.
  "cryptoMarket",
] as const;

/** Known write tools — never invoked from Companion, even if a stale proxy lists them. */
export const PHASE1_WRITE_DENYLIST = new Set(["set_price_alert", "create_journal_note"]);
/** listAxeTools source:"companion" — 18 catalog tools minus the 2 writes. */
export const COMPANION_READONLY_CATALOG_COUNT = 16;

const UNKNOWN_LIST_ERRORS = new Set([
  "unknown_action",
  "unknown_action_name",
  "not_found",
  "unsupported_action",
]);

export type JsonSchema = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  items?: unknown;
  enum?: unknown[];
  description?: string;
  [key: string]: unknown;
};

export type ReadOnlyAxeTool = {
  name: string;
  description: string;
  parameters: JsonSchema;
  readOnly: true;
  app: string;
  category: string;
};

export type ListTerminalToolsResult = {
  tools: ReadOnlyAxeTool[];
  source: "engine-proxy" | "fallback";
  available: boolean;
};

export type TerminalToolsClientOptions = {
  fetch?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
  invokeTimeoutMs?: number;
  listTimeoutMs?: number;
  supabaseUrl?: string;
  anonKey?: string;
  proxyUrl?: string;
};

export type ListTerminalToolsInput = {
  userId: string;
  accessToken: string;
};

export type InvokeTerminalToolInput = {
  userId: string;
  accessToken: string;
  companionName: string;
  args?: Record<string, unknown>;
  extras?: { symbol?: string; timeframe?: string; accountId?: string | null };
};

type CacheEntry = {
  expiresAt: number;
  result: ListTerminalToolsResult;
};

type EngineProxySuccess<T> = { ok: true; data: T };
type EngineProxyFailure = { ok: false; error?: string };
export type EngineProxyEnvelope<T> = EngineProxySuccess<T> | EngineProxyFailure;

type OpenAiTerminalTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
};

function tool(
  name: string,
  category: string,
  description: string,
  parameters: JsonSchema,
): ReadOnlyAxeTool {
  return {
    name,
    description,
    parameters: { type: "object", additionalProperties: false, ...parameters },
    readOnly: true,
    app: "shared",
    category,
  };
}

/**
 * Static catalog used while listAxeTools is missing (live engine-proxy has
 * invokeAxeTool but not listAxeTools). Matches TOS read-only AXE_TOOL_DEFINITIONS.
 */
export const FALLBACK_READONLY_AXE_TOOLS: ReadOnlyAxeTool[] = [
  tool(
    "inspect_chart",
    "chart",
    "Read the active chart: serialized state (drawings, indicator configs, visible range) and deterministic indicator last values from live candles. Missing state or candles returns UNAVAILABLE with a reason — never invent prices.",
    {
      properties: {
        symbol: { type: "string", description: "Canonical or display symbol (e.g. XAUUSD)." },
        timeframe: { type: "string", description: "Chart timeframe (e.g. 1H)." },
      },
    },
  ),
  tool(
    "inspect_account",
    "account",
    "Read the T3 BrokerReadService snapshot: connection state, balance/equity, positions, pending orders, history, bid/ask. Not connected is UNAVAILABLE, never a fake zero.",
    {
      properties: {
        accountId: { type: "string", description: "Optional broker account id; defaults to the active account." },
      },
    },
  ),
  tool(
    "inspect_risk",
    "risk",
    "Evaluate live risk via evaluateRiskSnapshot against the broker snapshot and the user rule profile (funded / personal / custom). Missing account data is UNAVAILABLE.",
    {
      properties: {
        accountId: { type: "string", description: "Optional broker account id; defaults to the active account." },
      },
    },
  ),
  tool("retrieve_memory", "memory", "Retrieve AXE memory items (commitments, insights, alerts, notes) for the user, optionally filtered by symbol.", {
    properties: { symbol: { type: "string" } },
  }),
  tool(
    "retrieve_history",
    "history",
    "Retrieve journal notes, broker deal history, and AXE memory. Missing slices are UNAVAILABLE with a reason; empty lists are honest zeros with no fake fills.",
    {
      properties: {
        symbol: { type: "string" },
        accountId: { type: "string" },
        limit: { type: "number" },
      },
    },
  ),
  tool(
    "get_macro_series",
    "macro",
    "Read one FRED macro series (engine-proxy macroSeries). Unknown keys or provider faults return UNAVAILABLE with the reason — never invented prints.",
    {
      required: ["key"],
      properties: {
        key: { type: "string", description: "FRED id or catalog alias (e.g. DGS10, VIXCLS, CPI_US)." },
        range: {
          type: "string",
          enum: ["1M", "3M", "6M", "1Y", "5Y", "ALL"],
          description: "Lookback window. Defaults to provider/service default.",
        },
      },
    },
  ),
  tool("list_macro_series", "macro", "List the FRED macro series catalog (engine-proxy listMacroSeries): key, name, unit, frequency.", {
    properties: {},
  }),
  tool(
    "get_big_mac_index",
    "macro",
    "The Economist Big Mac Index, bundled 2000–2025 (local price, dollar price, USD valuation %). Not a live feed. Unknown year/country is UNAVAILABLE.",
    {
      properties: {
        year: { type: "string", description: "Four-digit year, 2000–2025. Defaults to the latest year in the bundle." },
        country: {
          type: "string",
          description: "ISO3 (USA), country name (United States), or currency code (USD). Omit to return every country for the year.",
        },
      },
    },
  ),
  tool(
    "describe_terminal",
    "terminal",
    "Describe the Trading OS terminal: tabs, panels, data sources, and which AXE tools cover each surface. Static atlas — not a live screenshot.",
    { properties: {} },
  ),
  tool(
    "get_intel_feed",
    "intel",
    "Read one intel-proxy snapshot feed (jets, vessels, insiders, whales, senate, dark pool, options, tide, GDELT, weather, health, quotes, crypto funding / open interest / long-short via cryptoMarket, …). Failed or empty feeds return the provider reason — never invented rows.",
    {
      required: ["feed"],
      properties: {
        feed: {
          type: "string",
          enum: [...AXE_INTEL_FEED_NAMES],
          description: "intel-proxy action name.",
        },
        symbol: { type: "string", description: "Optional symbol filter for feeds that support it (e.g. insiderTrades)." },
      },
    },
  ),
  tool(
    "get_news",
    "news",
    "Market headlines from engine-proxy news (FMP and fallbacks). Provider faults (e.g. FMP 502 invalid_key) are UNAVAILABLE with the reason. Empty lists include why.",
    {
      properties: {
        symbol: { type: "string" },
        limit: { type: "number" },
      },
    },
  ),
  tool(
    "get_symbol_context",
    "news",
    "Analyst consensus, relative performance, key levels, and short/sentiment context for a symbol (engine-proxy FMP context actions). Missing slices are UNAVAILABLE with the provider reason — never invented targets.",
    {
      required: ["symbol"],
      properties: { symbol: { type: "string" } },
    },
  ),
  tool(
    "get_scanner",
    "scanner",
    "Market scanner rows from engine-proxy getScannerResults. An empty scan includes the engine reason (e.g. FMP invalid_key) — never a silent zero.",
    {
      properties: {
        sector: { type: "string" },
        minScore: { type: "number" },
        limit: { type: "number" },
      },
    },
  ),
  tool(
    "get_earnings_calendar",
    "earnings",
    "Earnings calendar from engine-proxy getEarningsCalendar (FMP). Invalid range or provider faults are UNAVAILABLE. Empty windows include the reason.",
    {
      required: ["from", "to"],
      properties: {
        from: { type: "string", description: "YYYY-MM-DD" },
        to: { type: "string", description: "YYYY-MM-DD" },
      },
    },
  ),
  tool(
    "get_polymarket",
    "prediction",
    "Public Polymarket Gamma search (no secret). Failed Gamma responses are UNAVAILABLE. Empty search results include the query and why.",
    {
      properties: {
        query: { type: "string", description: "Search text. Defaults to a broad “markets” query." },
        limit: { type: "number", description: "Max markets to return (1–50). Defaults to 12." },
      },
    },
  ),
  tool(
    "get_daily_briefing",
    "briefing",
    "The signed-in user’s latest row from axe_daily_briefings (JWT + RLS). Missing table or no row is UNAVAILABLE / empty with the reason — never a fabricated briefing.",
    {
      properties: {
        date: { type: "string", description: "Optional briefing_date (YYYY-MM-DD). Defaults to the latest row." },
      },
    },
  ),
];

export const FALLBACK_READONLY_TOOL_NAMES = FALLBACK_READONLY_AXE_TOOLS.map((t) => t.name);

export function companionToolName(engineName: string): string {
  const trimmed = engineName.trim();
  if (trimmed.startsWith(COMPANION_TOOL_PREFIX)) return trimmed;
  return `${COMPANION_TOOL_PREFIX}${trimmed}`;
}

export function engineToolName(companionName: string): string {
  const trimmed = companionName.trim();
  if (trimmed.startsWith(COMPANION_TOOL_PREFIX)) {
    return trimmed.slice(COMPANION_TOOL_PREFIX.length);
  }
  return trimmed;
}

export function isCompanionTerminalTool(name: string): boolean {
  return name.startsWith(COMPANION_TOOL_PREFIX);
}

export function isServiceRoleJwt(token: string): boolean {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return false;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json) as { role?: unknown };
    return payload.role === "service_role" || payload.role === "supabase_admin";
  } catch {
    return false;
  }
}

export function terminalUnavailablePayload(
  toolName: string,
  reason: string,
  field = "terminal",
): string {
  return JSON.stringify({
    ok: false,
    unavailable: true,
    tool: toolName,
    field,
    reason,
    quality: "unavailable",
  });
}

/** Inner AxeToolResult is unavailable when data.ok === false or data.unavailable is true. */
export function isInnerAxeToolUnavailable(data: unknown): boolean {
  const row = asRecord(data);
  if (!row) return false;
  return row.ok === false || row.unavailable === true;
}

/**
 * Unwrap engine-proxy invoke envelope.
 * Nested { ok:true, data:{ ok:false, unavailable:true, … } } is UNAVAILABLE, never success.
 * Top-level { ok:false, error } is a transport error.
 */
export function unwrapInvokeEnvelope(engineName: string, envelope: EngineProxyEnvelope<unknown>): string {
  if (!envelope.ok) {
    const err = readString(envelope.error) ?? "transport_error";
    return terminalUnavailablePayload(engineName, `terminal unavailable: ${err}`);
  }
  const data = envelope.data;
  if (data === undefined || data === null) {
    return terminalUnavailablePayload(engineName, "terminal unavailable: empty result");
  }
  if (isInnerAxeToolUnavailable(data)) {
    const row = asRecord(data) ?? {};
    return JSON.stringify({
      ok: false,
      unavailable: true,
      tool: readString(row.tool) ?? engineName,
      field: readString(row.field) ?? "terminal",
      reason: readString(row.reason) ?? "terminal unavailable",
      quality: "unavailable",
    });
  }
  return typeof data === "string" ? data : JSON.stringify(data);
}

function sanitizeToolArgs(args: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (key === "userId" || key === "user_id" || key === "accessToken" || key === "access_token" || key === "source") {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isReadOnlyFlag(value: unknown): boolean {
  return value === true;
}

function parseOneTool(raw: unknown): ReadOnlyAxeTool | null {
  const row = asRecord(raw);
  if (!row) return null;
  const fn = asRecord(row.function);
  const name = readString(row.name) ?? readString(fn?.name);
  if (!name) return null;
  if (PHASE1_WRITE_DENYLIST.has(name)) return null;
  if (!isReadOnlyFlag(row.readOnly) && !isReadOnlyFlag(fn?.readOnly)) return null;
  const description =
    readString(row.description) ??
    readString(fn?.description) ??
    `Read ${name} from the Trading OS terminal.`;
  const parameters = (asRecord(row.parameters) ?? asRecord(fn?.parameters) ?? {
    type: "object",
    properties: {},
  }) as JsonSchema;
  const app = readString(row.app) ?? readString(fn?.app) ?? "shared";
  const category = readString(row.category) ?? readString(fn?.category) ?? "terminal";
  return { name, description, parameters, readOnly: true, app, category };
}

function parseToolsArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const row = asRecord(raw);
  if (!row) return [];
  if (Array.isArray(row.tools)) return row.tools;
  if (Array.isArray(row.definitions)) return row.definitions;
  return [];
}

export function filterReadOnlyTools(raw: unknown): ReadOnlyAxeTool[] {
  const seen = new Set<string>();
  const out: ReadOnlyAxeTool[] = [];
  for (const item of parseToolsArray(raw)) {
    const parsed = parseOneTool(item);
    if (!parsed || seen.has(parsed.name)) continue;
    seen.add(parsed.name);
    out.push(parsed);
  }
  return out;
}

export function toOpenAiTerminalTools(tools: ReadOnlyAxeTool[]): OpenAiTerminalTool[] {
  return tools.map((item) => ({
    type: "function" as const,
    function: {
      name: companionToolName(item.name),
      description: `[Trading OS terminal — read-only] ${item.description}`,
      parameters: item.parameters,
    },
  }));
}

export function buildTerminalToolsPrompt(input: {
  tools: ReadOnlyAxeTool[];
  available: boolean;
  source: "engine-proxy" | "fallback";
}): string {
  if (!input.available || input.tools.length === 0) {
    return [
      "TRADING OS TERMINAL — OFFLINE THIS TURN",
      "The trader's Trading OS desktop terminal is unavailable (engine-proxy did not answer). Do not pretend you looked. Use Companion's own tools instead (get_live_price, read_journal, get_news_headlines, get_smart_money_intel, get_economic_calendar, list_alerts).",
      "If they asked “kijk in mijn terminal / Trading OS naar X”, say the terminal was not reachable and continue from Companion data.",
    ].join("\n");
  }

  const names = input.tools.map((t) => companionToolName(t.name));
  const hasDescribe = input.tools.some((t) => t.name === "describe_terminal");
  const catalog = input.tools
    .map((t) => `- ${companionToolName(t.name)} — ${t.description}`)
    .join("\n");

  return [
    "TRADING OS TERMINAL — ONE AXE ACROSS BOTH APPS",
    "You can read the trader's Trading OS desktop terminal through terminal_* tools. Same account, same AXE. Phase 1 is READ-ONLY: never write alerts, journal notes, or memory through the terminal.",
    "When the trader says “kijk in mijn terminal”, “kijk in Trading OS naar X”, “what's on my terminal”, or “in de terminal”:",
    hasDescribe
      ? "- Call terminal_describe_terminal first to see what the terminal currently shows, then the matching terminal_* tool."
      : "- Call the matching terminal_* tool (chart, account, risk, history, macro, intel, news, scanner, earnings, polymarket, briefings).",
    "If a terminal tool returns UNAVAILABLE, say the terminal was unreachable for that slice and continue with Companion's own tools. Never invent terminal data.",
    "Static datasets such as The Economist Big Mac Index must name the source and year of the observation. Never present them as a live price.",
    input.source === "fallback"
      ? "Tool catalog is the built-in read-only subset (listAxeTools is not live yet)."
      : "Tool catalog came from engine-proxy listAxeTools (source: companion).",
    `Available terminal tools: ${names.join(", ")}`,
    catalog,
  ].join("\n");
}

export function terminalStatusLabel(toolNames: string[]): string | null {
  if (toolNames.some((name) => isCompanionTerminalTool(name))) {
    return "kijkt in je terminal…";
  }
  return null;
}

function fallbackResult(): ListTerminalToolsResult {
  return {
    tools: FALLBACK_READONLY_AXE_TOOLS.map((t) => ({ ...t })),
    source: "fallback",
    available: true,
  };
}

function emptyUnavailable(): ListTerminalToolsResult {
  return { tools: [], source: "fallback", available: false };
}

export class TerminalToolsClient {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly cacheTtlMs: number;
  private readonly invokeTimeoutMs: number;
  private readonly listTimeoutMs: number;
  private readonly supabaseUrl?: string;
  private readonly anonKey?: string;
  private readonly proxyUrlOverride?: string;
  private cache: CacheEntry | null = null;

  constructor(opts: TerminalToolsClientOptions = {}) {
    this.fetchImpl = opts.fetch ?? fetch.bind(globalThis);
    this.now = opts.now ?? Date.now;
    this.cacheTtlMs = opts.cacheTtlMs ?? LIST_CACHE_TTL_MS;
    this.invokeTimeoutMs = opts.invokeTimeoutMs ?? INVOKE_TIMEOUT_MS;
    this.listTimeoutMs = opts.listTimeoutMs ?? LIST_TIMEOUT_MS;
    this.supabaseUrl = opts.supabaseUrl;
    this.anonKey = opts.anonKey;
    this.proxyUrlOverride = opts.proxyUrl;
  }

  resetCache(): void {
    this.cache = null;
  }

  private proxyUrl(): string | null {
    const custom = this.proxyUrlOverride ?? process.env.ENGINE_PROXY_URL;
    if (custom?.trim()) return custom.trim().replace(/\/$/, "");
    const base = (this.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
    if (!base) return null;
    return `${base}/functions/v1/engine-proxy`;
  }

  private anon(): string | null {
    return this.anonKey ?? getSupabaseKey() ?? null;
  }

  private usableUserToken(accessToken: string | undefined): string | null {
    const token = accessToken?.trim() ?? "";
    if (!token) return null;
    if (isServiceRoleJwt(token)) return null;
    return token;
  }

  private async post(
    action: string,
    args: Record<string, unknown>,
    accessToken: string,
    timeoutMs: number,
  ): Promise<{ status: number; json: EngineProxyEnvelope<unknown> } | { error: string }> {
    const url = this.proxyUrl();
    const anon = this.anon();
    if (!url || !anon) return { error: "terminal_unconfigured" };

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const res = await Promise.race([
        this.fetchImpl(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: anon,
          },
          body: JSON.stringify({ action, args }),
          signal: controller.signal,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            const err = new Error(`timeout_${timeoutMs}ms`);
            err.name = "AbortError";
            reject(err);
          }, timeoutMs);
        }),
      ]);
      const json = (await res.json().catch(() => ({
        ok: false,
        error: `invalid_json_${res.status}`,
      }))) as EngineProxyEnvelope<unknown>;
      return { status: res.status, json };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof Error && (err.name === "AbortError" || message.startsWith("timeout_"))) {
        return { error: `timeout_${timeoutMs}ms` };
      }
      return { error: message || "network_error" };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async listReadOnlyTools(input: ListTerminalToolsInput): Promise<ListTerminalToolsResult> {
    const token = this.usableUserToken(input.accessToken);
    if (!token || !input.userId.trim()) return emptyUnavailable();

    const now = this.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.result;
    }

    const posted = await this.post(
      "listAxeTools",
      { source: AXE_TOOL_SOURCE_COMPANION },
      token,
      this.listTimeoutMs,
    );

    if ("error" in posted) {
      const result = fallbackResult();
      this.cache = { expiresAt: now + this.cacheTtlMs, result };
      return result;
    }

    if (posted.status === 401 || posted.status === 403) {
      return emptyUnavailable();
    }

    const error = !posted.json.ok ? readString(posted.json.error) : undefined;
    if (posted.status === 400 && error && UNKNOWN_LIST_ERRORS.has(error)) {
      const result = fallbackResult();
      this.cache = { expiresAt: now + this.cacheTtlMs, result };
      return result;
    }

    if (!posted.json.ok) {
      const result = fallbackResult();
      this.cache = { expiresAt: now + this.cacheTtlMs, result };
      return result;
    }

    const tools = filterReadOnlyTools(posted.json.data);
    const result: ListTerminalToolsResult = {
      tools,
      source: "engine-proxy",
      available: tools.length > 0,
    };
    this.cache = { expiresAt: now + this.cacheTtlMs, result };
    return result;
  }

  async invoke(input: InvokeTerminalToolInput): Promise<string> {
    const engineName = engineToolName(input.companionName);
    try {
      const token = this.usableUserToken(input.accessToken);
      if (!token) {
        return terminalUnavailablePayload(engineName, "terminal unavailable: missing user session");
      }
      if (!input.userId.trim()) {
        return terminalUnavailablePayload(engineName, "terminal unavailable: missing user");
      }
      if (PHASE1_WRITE_DENYLIST.has(engineName)) {
        return terminalUnavailablePayload(
          engineName,
          "Companion may only invoke read-only AXE tools (Phase 1). This tool is not readOnly. Send source:'companion' only for readOnly tools.",
          "tool",
        );
      }

      const listed = await this.listReadOnlyTools({
        userId: input.userId,
        accessToken: token,
      });
      if (!listed.tools.some((t) => t.name === engineName)) {
        return terminalUnavailablePayload(
          engineName,
          "terminal unavailable: tool is not read-only or not in the catalog",
          "tool",
        );
      }

      const posted = await this.post(
        "invokeAxeTool",
        {
          userId: input.userId,
          name: engineName,
          args: sanitizeToolArgs(input.args),
          source: AXE_TOOL_SOURCE_COMPANION,
          ...(input.extras?.symbol ? { symbol: input.extras.symbol } : {}),
          ...(input.extras?.timeframe ? { timeframe: input.extras.timeframe } : {}),
          ...(input.extras?.accountId !== undefined ? { accountId: input.extras.accountId } : {}),
        },
        token,
        this.invokeTimeoutMs,
      );

      if ("error" in posted) {
        const reason = posted.error.startsWith("timeout_")
          ? `terminal unavailable: timeout after ${this.invokeTimeoutMs}ms`
          : `terminal unavailable: ${posted.error}`;
        return terminalUnavailablePayload(engineName, reason);
      }

      if (posted.status === 401 || posted.status === 403) {
        return terminalUnavailablePayload(engineName, "terminal unavailable: not authorised");
      }

      return unwrapInvokeEnvelope(engineName, posted.json);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return terminalUnavailablePayload(engineName, `terminal unavailable: ${message}`);
    }
  }
}

let shared: TerminalToolsClient | null = null;

export function getTerminalToolsClient(): TerminalToolsClient {
  if (!shared) shared = new TerminalToolsClient();
  return shared;
}

export async function resolveUserAccessToken(
  supabase: { auth: { getSession: () => Promise<{ data: { session: { access_token?: string } | null } }> } },
  explicit?: string | null,
): Promise<string | null> {
  const header = explicit?.trim() ?? "";
  if (header && !isServiceRoleJwt(header)) return header;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token?.trim() ?? "";
    if (!token || isServiceRoleJwt(token)) return null;
    return token;
  } catch {
    return null;
  }
}
