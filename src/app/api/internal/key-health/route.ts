import { NextResponse, type NextRequest } from "next/server";
import { hasCronSecret } from "@/lib/auth/cronSecret";
import { getSupabaseKey } from "@/lib/env";
import { firstNonEmptyEnv } from "@/lib/envFallback";
import { getMetaApiProvisioningBaseUrl, getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import {
  getEodhdKey,
  getFinnhubKey,
  getFredKey,
  getPerigonKey,
  getPolygonKey,
  getUnusualWhalesKey,
} from "@/lib/market/providerStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/internal/key-health  (Authorization: Bearer <CRON_SECRET>)
 *
 * Actually calls every provider with the configured key and reports whether it
 * works — unlike detectProviders(), which only checks that a key is present.
 * Never returns key values; key strings are scrubbed from any upstream error.
 *
 * ?intel=0 skips the Supabase intel-proxy feed probes (they spend provider quota).
 */

const TIMEOUT_MS = 8_000;

type CheckState = "ok" | "missing" | "invalid" | "error";
type Check = {
  name: string;
  area: string;
  state: CheckState;
  env: string[];
  detail?: string;
  ms?: number;
};

function env(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}


function scrub(text: string, secrets: Array<string | null>): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join("***");
  return out.replace(/\s+/g, " ").slice(0, 200);
}

async function httpCheck(
  base: Omit<Check, "state" | "detail" | "ms">,
  key: string | null,
  url: string,
  init: RequestInit = {},
  isOk: (res: Response, body: string) => boolean = (res) => res.ok,
): Promise<Check> {
  if (!key) return { ...base, state: "missing" };
  const start = Date.now();
  try {
    const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await res.text().catch(() => "");
    const ms = Date.now() - start;
    if (isOk(res, body)) return { ...base, state: "ok", ms };
    const state: CheckState = res.status === 401 || res.status === 403 ? "invalid" : "error";
    return { ...base, state, ms, detail: `HTTP ${res.status} ${scrub(body, [key])}` };
  } catch (e) {
    return {
      ...base,
      state: "error",
      ms: Date.now() - start,
      detail: scrub(e instanceof Error ? e.message : String(e), [key]),
    };
  }
}

function presence(name: string, area: string, names: string[], note?: string): Check {
  const ok = names.every((n) => env(n));
  return {
    name,
    area,
    env: names,
    state: ok ? "ok" : "missing",
    detail: ok ? (note ?? "present (not verifiable without a live call)") : `missing: ${names.filter((n) => !env(n)).join(", ")}`,
  };
}

function vercelChecks(): Array<Promise<Check>> {
  const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL")?.replace(/\/$/, "") ?? "";
  const serviceKey = firstNonEmptyEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE");
  const openai = firstNonEmptyEnv("OPENAI_API_KEY", "OPEN_AI_API_KEY");
  const ollama = firstNonEmptyEnv("OLLAMA_BASE_URL", "OLLAMA_URL", "OLLAMA_HOST", "OLLAMA_API_URL");
  const eleven = env("ELEVENLABS_API_KEY");
  const stripe = env("STRIPE_SECRET_KEY");
  const metaapi = getMetaApiToken();
  const krater = env("KRATER_API_KEY");
  const kraterBase = (env("KRATER_API_BASE") || "https://api.krater.ai").replace(/\/$/, "");
  const coingecko = firstNonEmptyEnv("COINGECKO_API_KEY", "COINGECKO_DEMO_API_KEY");
  const cgPro = env("COINGECKO_API_PLAN")?.toLowerCase() === "pro";
  const alpacaId = firstNonEmptyEnv("ALPACA_PAPER_API_KEY_ID", "ALPACA_PAPER_API_KEY", "ALPACA_API_KEY_ID", "ALPACA_API_KEY");
  const alpacaSecret = firstNonEmptyEnv("ALPACA_PAPER_API_SECRET_KEY", "ALPACA_API_SECRET_KEY");
  const alpacaBase = (firstNonEmptyEnv("ALPACA_PAPER_BASE_URL", "ALPACA_TRADING_BASE_URL") || "https://paper-api.alpaca.markets").replace(/\/$/, "");
  const uw = getUnusualWhalesKey();
  const fred = getFredKey();
  const perigon = getPerigonKey();
  const polygon = getPolygonKey();
  const finnhub = getFinnhubKey();
  const eodhd = getEodhdKey();

  const stripePrices = (["STRIPE_PRICE_PRO", "STRIPE_PRICE_FOUNDER", "STRIPE_PRICE_ELITE"] as const).map((n) =>
    httpCheck(
      { name: `Stripe price ${n.replace("STRIPE_PRICE_", "").toLowerCase()}`, area: "billing", env: [n, "STRIPE_SECRET_KEY"] },
      stripe && env(n) ? stripe : null,
      `https://api.stripe.com/v1/prices/${encodeURIComponent(env(n) ?? "")}`,
      { headers: { Authorization: `Bearer ${stripe}` } },
      (res, body) => res.ok && /"active":\s*true/.test(body),
    ),
  );

  return [
    httpCheck(
      { name: "Supabase service role", area: "core", env: ["SUPABASE_SERVICE_ROLE_KEY"] },
      serviceKey && supabaseUrl ? serviceKey : null,
      `${supabaseUrl}/rest/v1/user_workspace_preferences?select=user_id&limit=1`,
      { headers: { apikey: serviceKey ?? "", Authorization: `Bearer ${serviceKey}` } },
    ),
    httpCheck(
      { name: "Ollama", area: "ai", env: ["OLLAMA_BASE_URL"] },
      ollama,
      `${(ollama ?? "").replace(/\/$/, "")}/api/tags`,
    ),
    httpCheck(
      { name: "OpenAI", area: "ai", env: ["OPENAI_API_KEY"] },
      openai,
      "https://api.openai.com/v1/models",
      { headers: { Authorization: `Bearer ${openai}` } },
    ),
    httpCheck(
      { name: "ElevenLabs (voice)", area: "ai", env: ["ELEVENLABS_API_KEY"] },
      eleven,
      "https://api.elevenlabs.io/v1/user/subscription",
      { headers: { "xi-api-key": eleven ?? "" } },
      // Restricted keys may lack user_read but still speak — that is fine for TTS.
      (res, body) => res.ok || (res.status === 401 && body.includes("missing_permissions")),
    ),
    httpCheck(
      { name: "Krater (broadcast feed)", area: "feed", env: ["KRATER_API_KEY"] },
      krater,
      `${kraterBase}/v1/models`,
      { headers: { Authorization: `Bearer ${krater}` } },
    ),
    httpCheck(
      { name: "MetaApi (MT5)", area: "broker", env: ["METAAPI_TOKEN"] },
      metaapi,
      `${getMetaApiProvisioningBaseUrl()}/users/current/accounts?limit=1`,
      { headers: { "auth-token": metaapi ?? "" } },
    ),
    httpCheck(
      { name: "Alpaca paper", area: "broker", env: ["ALPACA_PAPER_API_KEY_ID", "ALPACA_PAPER_API_SECRET_KEY"] },
      alpacaId && alpacaSecret ? alpacaId : null,
      `${alpacaBase}/v2/account`,
      { headers: { "APCA-API-KEY-ID": alpacaId ?? "", "APCA-API-SECRET-KEY": alpacaSecret ?? "" } },
    ),
    httpCheck(
      { name: "Stripe secret key", area: "billing", env: ["STRIPE_SECRET_KEY"] },
      stripe,
      "https://api.stripe.com/v1/balance",
      { headers: { Authorization: `Bearer ${stripe}` } },
    ),
    ...stripePrices,
    httpCheck(
      { name: "Unusual Whales (Next side)", area: "intel", env: ["UNUSUAL_WHALES_TOKEN"] },
      uw,
      "https://api.unusualwhales.com/api/market/market-tide",
      { headers: { Authorization: `Bearer ${uw}`, Accept: "application/json" } },
    ),
    httpCheck(
      { name: "FRED (macro)", area: "market", env: ["FRED_API_KEY"] },
      fred,
      `https://api.stlouisfed.org/fred/series?series_id=DGS10&file_type=json&api_key=${fred}`,
    ),
    httpCheck(
      { name: "Perigon (news)", area: "market", env: ["PERIGON_API_KEY"] },
      perigon,
      `https://api.goperigon.com/v1/all?size=1&apiKey=${perigon}`,
    ),
    httpCheck(
      { name: "Polygon (reference news)", area: "market", env: ["POLYGON_API_KEY"] },
      polygon,
      `https://api.polygon.io/v2/reference/news?limit=1&apiKey=${polygon}`,
    ),
    httpCheck(
      { name: "Finnhub (calendar/news)", area: "market", env: ["FINNHUB_API_KEY"] },
      finnhub,
      `https://finnhub.io/api/v1/news?category=general&token=${finnhub}`,
    ),
    httpCheck(
      { name: "EODHD (news fallback)", area: "market", env: ["EODHD_API_KEY"] },
      eodhd,
      `https://eodhd.com/api/news?s=AAPL.US&limit=1&fmt=json&api_token=${eodhd}`,
    ),
    httpCheck(
      { name: "CoinGecko (wallets)", area: "wallets", env: ["COINGECKO_API_KEY", "COINGECKO_API_PLAN"] },
      coingecko,
      `${cgPro ? "https://pro-api.coingecko.com" : "https://api.coingecko.com"}/api/v3/ping`,
      { headers: { [cgPro ? "x-cg-pro-api-key" : "x-cg-demo-api-key"]: coingecko ?? "" } },
    ),
    Promise.resolve(presence("Cron secret", "core", ["CRON_SECRET"])),
    Promise.resolve(presence("Stripe webhook secret", "billing", ["STRIPE_WEBHOOK_SECRET"])),
    Promise.resolve(presence("Push (VAPID)", "push", ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"])),
    Promise.resolve(presence("Chart live WS", "chart", ["NEXT_PUBLIC_CHART_WS_URL", "CHART_SESSION_JWT_SECRET"])),
    Promise.resolve(presence("WalletConnect", "wallets", ["NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID"])),
    Promise.resolve(presence("AXE Core tools secret", "axe-core", ["AXE_CORE_TOOLS_SECRET"])),
    Promise.resolve(presence("App URL", "core", ["NEXT_PUBLIC_APP_URL"])),
  ];
}

/**
 * intel-proxy feeds run on Supabase Edge with their own secrets. Probe each
 * action raw (no DB fallback) so a dead key shows as a failing feed.
 */
const INTEL_FEEDS: Array<{ action: string; name: string; env: string[] }> = [
  { action: "marketTide", name: "Market tide", env: ["UNUSUAL_WHALES_TOKEN", "FINNHUB_API_KEY"] },
  { action: "darkPoolPrints", name: "Dark pool", env: ["UNUSUAL_WHALES_TOKEN", "FINNHUB_API_KEY"] },
  { action: "unusualOptions", name: "Options flow", env: ["UNUSUAL_WHALES_TOKEN", "FINNHUB_API_KEY"] },
  { action: "insiderTrades", name: "Insider (Form 4)", env: ["UNUSUAL_WHALES_TOKEN (SEC EDGAR fallback)"] },
  { action: "senateTrades", name: "Congress trades", env: ["QUIVER_API_KEY", "FMP_API_KEY"] },
  { action: "corporateJets", name: "Corporate jets", env: ["OPENSKY_USERNAME", "OPENSKY_PASSWORD", "RAPIDAPI_KEY"] },
  { action: "militaryRadar", name: "Military radar", env: ["RAPIDAPI_KEY"] },
  { action: "emergencyMonitor", name: "Emergency squawks", env: ["RAPIDAPI_KEY"] },
  { action: "vesselTracking", name: "Vessels", env: ["AISSTREAM_API_KEY"] },
  { action: "conflictEvents", name: "Conflict events", env: ["ACLED_MAIL", "ACLED_PASSWORD"] },
  { action: "energyFlows", name: "Energy flows", env: ["EIA_API_KEY"] },
  { action: "cyberThreats", name: "Cyber threats", env: ["GREYNOISE_API_KEY"] },
];

function intelChecks(): Array<Promise<Check>> {
  const url = env("NEXT_PUBLIC_SUPABASE_URL")?.replace(/\/$/, "");
  const anon = getSupabaseKey() ?? null;
  return INTEL_FEEDS.map(async (feed): Promise<Check> => {
    const base = { name: `Intel: ${feed.name}`, area: "intel-edge", env: feed.env };
    if (!url || !anon) return { ...base, state: "missing", detail: "Supabase URL/anon key missing" };
    const start = Date.now();
    try {
      const res = await fetch(`${url}/functions/v1/intel-proxy`, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${anon}`, apikey: anon },
        body: JSON.stringify({ action: feed.action, args: {} }),
      });
      const ms = Date.now() - start;
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; data?: unknown; error?: string; source?: string }
        | null;
      if (!res.ok || !json?.ok) {
        return { ...base, state: "error", ms, detail: scrub(json?.error ?? `HTTP ${res.status}`, [anon]) };
      }
      const rows = Array.isArray(json.data) ? json.data.length : json.data ? 1 : 0;
      const source = json.source ? ` source=${json.source}` : "";
      return rows > 0
        ? { ...base, state: "ok", ms, detail: `${rows} rows${source}` }
        : { ...base, state: "error", ms, detail: `0 rows${source} — key missing/invalid or upstream empty` };
    } catch (e) {
      return { ...base, state: "error", ms: Date.now() - start, detail: e instanceof Error ? e.message : String(e) };
    }
  });
}

export async function GET(request: NextRequest) {
  if (!hasCronSecret(request.headers)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const includeIntel = request.nextUrl.searchParams.get("intel") !== "0";
  const checks = await Promise.all([...vercelChecks(), ...(includeIntel ? intelChecks() : [])]);

  const summary = { ok: 0, missing: 0, invalid: 0, error: 0 } satisfies Record<CheckState, number>;
  for (const c of checks) summary[c.state] += 1;

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      summary,
      broken: checks.filter((c) => c.state === "invalid" || c.state === "error").map((c) => c.name),
      missing: checks.filter((c) => c.state === "missing").map((c) => c.name),
      checks,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
