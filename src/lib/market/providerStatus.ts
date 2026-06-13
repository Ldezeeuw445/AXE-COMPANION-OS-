import type { ProviderId, ProviderStatus } from "@/lib/market/marketTypes";

/**
 * Read-only env detection — returns null if not configured. Server-only;
 * never import these helpers from client components.
 */

function trimOrNull(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

export function getFredKey(): string | null {
  return trimOrNull(process.env.FRED_API_KEY);
}
export function getPerigonKey(): string | null {
  return trimOrNull(process.env.PERIGON_API_KEY);
}
export function getPolygonKey(): string | null {
  // Accept either name — the user already has POLYGON_API_KEY in some envs
  // and POLYGON_KEY in others (matches Polygon SDK conventions).
  return trimOrNull(process.env.POLYGON_API_KEY ?? process.env.POLYGON_KEY);
}
export function getFinnhubKey(): string | null {
  return trimOrNull(process.env.FINNHUB_API_KEY);
}
export function getEodhdKey(): string | null {
  return trimOrNull(process.env.EODHD_API_KEY);
}
export function getUnusualWhalesKey(): string | null {
  return trimOrNull(process.env.UNUSUAL_WHALES_TOKEN ?? process.env.UNUSUAL_WHALES_API_KEY);
}

export function detectProviders(): ProviderStatus[] {
  return [
    {
      id: "fred" satisfies ProviderId,
      label: "AXE Macro",
      state: getFredKey() ? "live" : "missing_config",
      description: "Macro time series — yields, rates, CPI, employment.",
      env: ["FRED_API_KEY"],
    },
    {
      id: "perigon",
      label: "AXE News",
      state: getPerigonKey() ? "live" : "missing_config",
      description: "Curated news with topics, entities and sentiment.",
      env: ["PERIGON_API_KEY"],
    },
    {
      id: "polygon",
      label: "AXE Reference",
      state: getPolygonKey() ? "live" : "missing_config",
      description: "Polygon.io reference news — equities, crypto, FX context.",
      env: ["POLYGON_API_KEY", "POLYGON_KEY"],
    },
    {
      id: "finnhub",
      label: "AXE Calendar",
      state: getFinnhubKey() ? "live" : "missing_config",
      description: "Economic calendar (Finnhub premium) with Forex Factory fallback.",
      env: ["FINNHUB_API_KEY"],
    },
    {
      id: "forexFactory",
      label: "AXE Calendar",
      state: "live",
      description: "Free economic calendar fallback (Forex Factory mirror).",
      env: [],
    },
    {
      id: "eodhd",
      label: "AXE Fallback",
      state: getEodhdKey() ? "live" : "missing_config",
      description: "Financial news + fundamentals (fallback).",
      env: ["EODHD_API_KEY"],
    },
    {
      id: "unusualWhales",
      label: "AXE Intel",
      state: getUnusualWhalesKey() ? "live" : "missing_config",
      description: "Smart money: insider, congress, dark pool, options flow, tide.",
      env: ["UNUSUAL_WHALES_TOKEN", "UNUSUAL_WHALES_API_KEY"],
    },
  ];
}

export function anyProviderLive(): boolean {
  return detectProviders().some((p) => p.state === "live");
}
