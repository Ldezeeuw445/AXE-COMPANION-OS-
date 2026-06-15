// supabase/functions/market-proxy/index.ts
// ─────────────────────────────────────────────────────────────────────
// Supabase Edge Function that proxies FRED and Finnhub API calls using
// secrets stored in the Supabase dashboard.  The Next.js backend calls
// this when local env vars (FRED_API_KEY, FINNHUB_API_KEY) are absent,
// keeping all third-party credentials in a single secrets store.
//
// Deploy:  supabase functions deploy market-proxy --no-verify-jwt
// Secrets: supabase secrets set FRED_API_KEY=xxx FINNHUB_API_KEY=yyy
// Optional: EDGE_PROVIDER_KEYS_JSON='{"FRED_API_KEY":"…","FINNHUB_API_KEY":"…"}'
// ─────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getMergedEdgeEnv } from "../_shared/mergeEdgeEnv.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function resolveFredKey(env: Record<string, string>): string {
  return (
    env.FRED_API_KEY ||
    env.FRED_KEY ||
    env.STLOUISFED_API_KEY ||
    env.STLOUISFED_KEY ||
    ""
  ).trim();
}

function resolveFinnhubKey(env: Record<string, string>): string {
  return (env.FINNHUB_API_KEY || env.FINNHUB_KEY || "").trim();
}

// ── FRED macro snapshot ────────────────────────────────────────────────
const FRED_SERIES: { id: string; label: string; units: string }[] = [
  { id: "DGS10", label: "US 10Y Yield", units: "%" },
  { id: "DGS2", label: "US 2Y Yield", units: "%" },
  { id: "DEXUSEU", label: "EUR/USD", units: "rate" },
  { id: "DTWEXBGS", label: "Trade-Wtd USD", units: "index" },
  { id: "CPIAUCSL", label: "CPI (SA)", units: "index" },
  { id: "UNRATE", label: "Unemployment", units: "%" },
  { id: "FEDFUNDS", label: "Fed Funds Rate", units: "%" },
  { id: "T10Y2Y", label: "10Y-2Y Spread", units: "%" },
];

async function handleMacroSnapshot(env: Record<string, string>): Promise<Response> {
  const apiKey = resolveFredKey(env);
  if (!apiKey) {
    return json(
      {
        ok: false,
        error: "FRED_API_KEY not configured",
        hint: "Set FRED_API_KEY on Supabase Edge secrets or in EDGE_PROVIDER_KEYS_JSON",
      },
      503,
    );
  }

  const points: {
    seriesId: string;
    label: string;
    value: number | null;
    units: string;
    observedAt: string | null;
  }[] = [];

  for (const series of FRED_SERIES) {
    try {
      const params = new URLSearchParams({
        series_id: series.id,
        api_key: apiKey,
        file_type: "json",
        sort_order: "desc",
        limit: "1",
      });
      const res = await fetch(
        `https://api.stlouisfed.org/fred/series/observations?${params.toString()}`,
      );
      if (!res.ok) {
        points.push({
          seriesId: series.id,
          label: series.label,
          value: null,
          units: series.units,
          observedAt: null,
        });
        continue;
      }
      const body = await res.json();
      const obs = body?.observations?.[0];
      const raw = obs?.value;
      const value = raw != null && raw !== "." ? parseFloat(raw) : null;
      points.push({
        seriesId: series.id,
        label: series.label,
        value: Number.isFinite(value) ? value : null,
        units: series.units,
        observedAt: obs?.date ?? null,
      });
    } catch {
      points.push({
        seriesId: series.id,
        label: series.label,
        value: null,
        units: series.units,
        observedAt: null,
      });
    }
  }

  const hasAny = points.some((p) => p.value != null);
  if (!hasAny) {
    return json({ ok: false, error: "fred_no_observations", hint: "Check FRED_API_KEY validity" }, 503);
  }

  return json({
    ok: true,
    data: { generatedAt: new Date().toISOString(), points },
  });
}

// ── Finnhub economic calendar ──────────────────────────────────────────
async function handleEconomicCalendar(env: Record<string, string>, daysAhead = 5): Promise<Response> {
  const apiKey = resolveFinnhubKey(env);
  if (!apiKey) {
    return json(
      {
        ok: false,
        error: "FINNHUB_API_KEY not configured",
        hint: "Set FINNHUB_API_KEY on Supabase Edge secrets or in EDGE_PROVIDER_KEYS_JSON",
      },
      503,
    );
  }

  const now = new Date();
  const from = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const params = new URLSearchParams({
    from: fmt(from),
    to: fmt(to),
    token: apiKey,
  });

  try {
    const res = await fetch(`https://finnhub.io/api/v1/calendar/economic?${params.toString()}`);
    if (!res.ok) {
      const status = res.status === 401 || res.status === 403 ? 503 : 502;
      return json(
        {
          ok: false,
          error: `finnhub_${res.status}`,
          hint:
            res.status === 401 || res.status === 403
              ? "FINNHUB_API_KEY invalid or missing on Supabase Edge secrets"
              : "Finnhub upstream error",
        },
        status,
      );
    }
    const body = await res.json();
    const events = (body?.economicCalendar ?? []).map(
      (e: Record<string, unknown>, i: number) => ({
        id: `finnhub:${e.country ?? ""}:${e.event ?? ""}:${e.time ?? i}`,
        title: e.event ?? "Economic event",
        country: e.country ?? null,
        impact: mapImpact(e.impact as string | null),
        startsAt: e.time
          ? new Date(String(e.time).replace(" ", "T") + "Z").toISOString()
          : now.toISOString(),
        actual: e.actual ?? null,
        forecast: e.estimate ?? null,
        previous: e.prev ?? null,
        unit: e.unit ?? null,
      }),
    );
    return json({ ok: true, data: { generatedAt: new Date().toISOString(), events } });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

function mapImpact(raw: string | null): string {
  if (!raw) return "unknown";
  const v = String(raw).toLowerCase();
  if (v === "3" || v.includes("high")) return "high";
  if (v === "2" || v.includes("medium") || v.includes("moderate")) return "medium";
  if (v === "1" || v.includes("low")) return "low";
  return "unknown";
}

// ── Handler ────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const env = getMergedEdgeEnv();

  try {
    const body = await req.json();
    const action = body?.action as string;

    switch (action) {
      case "macroSnapshot":
        return await handleMacroSnapshot(env);
      case "economicCalendar":
        return await handleEconomicCalendar(env, body?.daysAhead ?? 5);
      default:
        return json({ ok: false, error: `unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
