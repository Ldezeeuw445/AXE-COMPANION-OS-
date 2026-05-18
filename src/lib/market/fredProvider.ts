import "server-only";
import { getFredKey } from "@/lib/market/providerStatus";
import { getSupabaseKey, getSupabaseServiceRoleKey } from "@/lib/env";
import type { MacroSnapshot, MacroSnapshotPoint } from "@/lib/market/marketTypes";
import { briefingForSymbol } from "@/lib/market/symbolContext";

const FRED_BASE = "https://api.stlouisfed.org/fred";
const REVALIDATE_SECONDS = 60 * 60; // 1h — FRED data updates daily/monthly

type FredObservation = {
  date: string;
  value: string;
};

async function fetchSeriesObservations(
  seriesId: string,
  apiKey: string,
): Promise<FredObservation[]> {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    sort_order: "desc",
    limit: "1",
  });
  const res = await fetch(`${FRED_BASE}/series/observations?${params.toString()}`, {
    next: { revalidate: REVALIDATE_SECONDS, tags: [`fred:${seriesId}`] },
  });
  if (!res.ok) return [];
  try {
    const body = (await res.json()) as { observations?: FredObservation[] };
    return body.observations ?? [];
  } catch {
    return [];
  }
}

function parseValue(raw: string): number | null {
  if (!raw || raw === "." || raw === "n/a") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ── Edge Function fallback ──────────────────────────────────────────────
// When FRED_API_KEY is missing from the Vercel env, route through the
// market-proxy Supabase Edge Function which holds the key in its own
// secrets.  This keeps all third-party credentials in one place and
// avoids duplicating them across Vercel + Supabase.
async function loadMacroViaEdgeFunction(): Promise<MacroSnapshot | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = getSupabaseKey();
  if (!url || !anonKey) return null;
  const bearerKey = getSupabaseServiceRoleKey() ?? anonKey;
  try {
    const res = await fetch(`${url}/functions/v1/market-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ action: "macroSnapshot" }),
      next: { revalidate: REVALIDATE_SECONDS, tags: ["fred:edge-proxy"] },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      ok?: boolean;
      data?: { generatedAt?: string; points?: MacroSnapshotPoint[] };
    };
    if (!body.ok || !body.data) return null;
    return {
      source: "fred",
      generatedAt: body.data.generatedAt ?? new Date().toISOString(),
      symbol: "",
      points: body.data.points ?? [],
    };
  } catch {
    return null;
  }
}

/**
 * Build a macro snapshot for a display symbol — yields, rates, USD index, VIX, …
 * Returns null when FRED is not configured anywhere.
 *
 * Strategy:
 *   1. If FRED_API_KEY is in the Vercel env → call FRED directly (fast).
 *   2. Otherwise → proxy through the market-proxy Edge Function that
 *      holds the key in Supabase secrets (max 1 call per revalidate window).
 */
export async function loadMacroSnapshot(symbol: string): Promise<MacroSnapshot | null> {
  const apiKey = getFredKey();

  // ── Path B: no local key → try Edge Function proxy ──
  if (!apiKey) {
    const proxied = await loadMacroViaEdgeFunction();
    if (proxied) {
      proxied.symbol = symbol;
    }
    return proxied;
  }

  // ── Path A: direct FRED call ──
  const briefing = briefingForSymbol(symbol);
  if (briefing.fredSeries.length === 0) {
    return {
      source: "fred",
      generatedAt: new Date().toISOString(),
      symbol,
      points: [],
    };
  }

  const points: MacroSnapshotPoint[] = await Promise.all(
    briefing.fredSeries.map(async (s) => {
      const obs = await fetchSeriesObservations(s.seriesId, apiKey);
      const latest = obs[0];
      return {
        seriesId: s.seriesId,
        label: s.label,
        units: s.units,
        value: latest ? parseValue(latest.value) : null,
        observedAt: latest?.date ?? null,
      };
    }),
  );

  return {
    source: "fred",
    generatedAt: new Date().toISOString(),
    symbol,
    points,
  };
}
