import "server-only";
import { getFredKey } from "@/lib/market/providerStatus";
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

/**
 * Build a macro snapshot for a display symbol — yields, rates, USD index, VIX, …
 * Returns null when FRED is not configured.
 */
export async function loadMacroSnapshot(symbol: string): Promise<MacroSnapshot | null> {
  const apiKey = getFredKey();
  if (!apiKey) return null;

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
