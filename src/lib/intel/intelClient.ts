import "server-only";
import { getSupabaseKey, getSupabaseServiceRoleKey } from "@/lib/env";

const REVALIDATE_SECONDS = 15 * 60; // Unusual Whales is expensive and slow-moving enough for 15 min cache.
const SNAPSHOT_FRESH_MS = 15 * 60 * 1000;
const SNAPSHOT_STALE_MS = 24 * 60 * 60 * 1000;
const INTEL_PROXY_TIMEOUT_MS = 12_000;

export type IntelProviderState = "live" | "off" | "error";

export type IntelProviderStatus = {
  id:
    | "insiderTrades"
    | "senateTrades"
    | "darkPoolPrints"
    | "unusualOptions"
    | "marketTide"
    | "corporateJets"
    | "vesselTracking"
    | "conflictEvents"
    | "energyFlows"
    | "cyberThreats";
  label: string;
  state: IntelProviderState;
  description?: string;
};

export type InsiderTrade = {
  ticker: string;
  insider: string;
  role?: string;
  type: "BUY" | "SELL";
  shares?: number;
  value: number;
  date: string;
};

export type SenateTrade = {
  politician: string;
  chamber: string;
  ticker: string;
  direction: "BUY" | "SELL";
  size: string;
  date: string;
};

export type DarkPoolPrint = {
  symbol: string;
  price: number;
  size: number;
  notional: number;
  side?: "buy" | "sell" | "neutral";
  /** HH:MM stamp from the proxy. */
  time?: string;
};

export type UnusualOption = {
  symbol: string;
  strike: number;
  exp: string;
  vol: number;
  oi: number;
  side: "CALL" | "PUT";
  premium: number;
  sweep: boolean;
  rule?: string | null;
};

export type MarketTide = {
  timestamp: string;
  netCallPremium: number;
  netPutPremium: number;
  callPutRatio: number;
  bias: "bullish" | "bearish" | "neutral";
};

/* ── Alt-Data Types ───────────────────────────────────────────────── */

export type CorporateJet = {
  icao24: string;
  callsign: string;
  company: string;
  ticker: string;
  tailNumber: string;
  originCountry: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  velocity: number | null;
  onGround: boolean;
};

export type VesselTrack = {
  mmsi: string;
  vesselName: string;
  vesselType: string;
  owner: string;
  ownerType: "corporate" | "state" | "oligarch" | "unknown";
  significance: string;
  isTracked: boolean;
  lastSeen: string | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  speedKnots: number | null;
  heading: number | null;
  destination: string | null;
  nearChokepoint: string | null;
  alertLevel: "normal" | "warning" | "critical";
};

export type Chokepoint = {
  id: number;
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  radiusNm: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  riskFactors: string;
  dailyShipCount: number;
  percentageGlobalTrade: number;
  updatedAt: string;
};

export type ConflictEvent = {
  eventId: string;
  eventDate: string;
  country: string;
  region: string;
  eventType: string;
  subEventType: string;
  actor1: string;
  fatalities: number;
  notes: string;
  latitude: number | null;
  longitude: number | null;
};

export type EnergyFlow = {
  seriesId: string;
  seriesName: string;
  period: string;
  value: number | null;
  unit: string;
};

export type CyberThreat = {
  ip: string;
  classification: string;
  name: string;
  noise: boolean;
  riot: boolean;
  lastSeen: string;
  tags: string[];
  category: string;
};

export type IntelCorrelation = {
  id: string;
  title: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  signal: string | null;
  feedsUsed: string[];
  symbols: string[];
  createdAt: string;
};

export type IntelSnapshot = {
  generatedAt: string;
  insiders: InsiderTrade[];
  senate: SenateTrade[];
  darkPool: DarkPoolPrint[];
  options: UnusualOption[];
  tide: MarketTide | null;
  /* Alt-data feeds */
  jets: CorporateJet[];
  vessels: VesselTrack[];
  chokepoints: Chokepoint[];
  conflicts: ConflictEvent[];
  energy: EnergyFlow[];
  cyber: CyberThreat[];
  providers: IntelProviderStatus[];
  hasLiveData: boolean;
  cache: {
    state: "fresh" | "stale" | "empty";
    ageSeconds: number | null;
    message?: string;
  };
};

type IntelAction =
  | "insiderTrades"
  | "senateTrades"
  | "darkPoolPrints"
  | "unusualOptions"
  | "marketTide"
  | "corporateJets"
  | "vesselTracking"
  | "chokepoints"
  | "conflictEvents"
  | "energyFlows"
  | "cyberThreats";

type IntelEnvelope<T> = { ok: true; data: T } | { ok: false; error: string };

type IntelSnapshotCacheEntry = {
  snapshot: IntelSnapshot;
  savedAt: number;
};

const intelSnapshotCache = globalThis as typeof globalThis & {
  __axeIntelSnapshotCache?: Map<string, IntelSnapshotCacheEntry>;
  __axeIntelSnapshotInflight?: Map<string, Promise<IntelSnapshot>>;
};

const snapshotCache = intelSnapshotCache.__axeIntelSnapshotCache ?? new Map<string, IntelSnapshotCacheEntry>();
const snapshotInflight = intelSnapshotCache.__axeIntelSnapshotInflight ?? new Map<string, Promise<IntelSnapshot>>();
intelSnapshotCache.__axeIntelSnapshotCache = snapshotCache;
intelSnapshotCache.__axeIntelSnapshotInflight = snapshotInflight;

async function callIntelProxy<T>(
  action: IntelAction,
  args: Record<string, unknown> = {},
): Promise<IntelEnvelope<T>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = getSupabaseKey();
  if (!url || !anonKey) return { ok: false, error: "missing_supabase_env" };
  // Use the service-role key for the Authorization Bearer token when
  // available — this gives the Edge Function elevated server-side context
  // and avoids JWT-verification failures that occur with the anon key on
  // functions deployed with default settings.  The `apikey` header always
  // uses the anon key (Supabase API gateway routing).
  const bearerKey = getSupabaseServiceRoleKey() ?? anonKey;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), INTEL_PROXY_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/functions/v1/intel-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerKey}`,
        apikey: anonKey,
      },
      signal: ctrl.signal,
      body: JSON.stringify({ action, ...args }),
      // Edge function is rate-limited and the data is slow-moving. Keep each
      // action cached for long enough that page reloads and chat context refreshes
      // don't hammer a paid provider account.
      next: { revalidate: REVALIDATE_SECONDS, tags: [`intel:${action}`] },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `intel_proxy_${res.status}:${body.slice(0, 120)}` };
    }
    const json = (await res.json()) as { ok?: boolean; data?: T; error?: string };
    if (!json.ok) return { ok: false, error: json.error ?? "intel_proxy_unknown_error" };
    return { ok: true, data: (json.data ?? null) as T };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, error: `intel_proxy_timeout_${INTEL_PROXY_TIMEOUT_MS}ms` };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

function toStatus(
  id: IntelProviderStatus["id"],
  label: string,
  description: string,
  ok: boolean,
  err?: string,
): IntelProviderStatus {
  if (ok) return { id, label, state: "live", description };
  if (err) {
    return {
      id,
      label,
      state: "error",
      description: `${description} — temporarily unavailable; using cached data when available`,
    };
  }
  return {
    id,
    label,
    state: "off",
    description: `${description} — no cached rows yet`,
  };
}

export async function loadIntelSnapshot(opts?: {
  symbol?: string;
}): Promise<IntelSnapshot> {
  const cacheKey = (opts?.symbol ?? "market").toUpperCase();
  const cached = snapshotCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < SNAPSHOT_FRESH_MS) {
    return markCache(cached.snapshot, "fresh", cached.savedAt);
  }

  const inflight = snapshotInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = fetchIntelSnapshot(opts, cached);
  snapshotInflight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    snapshotInflight.delete(cacheKey);
  }
}

async function fetchIntelSnapshot(
  opts: { symbol?: string } | undefined,
  cached?: IntelSnapshotCacheEntry,
): Promise<IntelSnapshot> {
  const args: Record<string, unknown> = opts?.symbol
    ? { symbol: opts.symbol.toUpperCase() }
    : {};

  // The Unusual Whales plan only allows a small number of concurrent requests.
  // Serial calls are intentional: one page render must never create a provider
  // concurrency burst that takes the whole intel page down.
  const insiderRes = await callIntelProxy<InsiderTrade[]>("insiderTrades", args);
  const senateRes = await callIntelProxy<SenateTrade[]>("senateTrades", {});
  const darkPoolRes = await callIntelProxy<DarkPoolPrint[]>("darkPoolPrints", args);
  const optionsRes = await callIntelProxy<UnusualOption[]>("unusualOptions", args);
  const tideRes = await callIntelProxy<MarketTide | null>("marketTide", {});

  // Alt-data feeds — these are independent of each other so failures in one
  // don't block the rest. Each has its own fallback chain (API → DB → empty).
  const jetsRes = await callIntelProxy<CorporateJet[]>("corporateJets", {});
  const vesselRes = await callIntelProxy<VesselTrack[]>("vesselTracking", {});
  const chokepointRes = await callIntelProxy<Chokepoint[]>("chokepoints", {});
  const conflictRes = await callIntelProxy<ConflictEvent[]>("conflictEvents", {});
  const energyRes = await callIntelProxy<EnergyFlow[]>("energyFlows", {});
  const cyberRes = await callIntelProxy<CyberThreat[]>("cyberThreats", {});

  const insiders = insiderRes.ok && Array.isArray(insiderRes.data) ? insiderRes.data : [];
  const senate = senateRes.ok && Array.isArray(senateRes.data) ? senateRes.data : [];
  const darkPool = darkPoolRes.ok && Array.isArray(darkPoolRes.data) ? darkPoolRes.data : [];
  const options = optionsRes.ok && Array.isArray(optionsRes.data) ? optionsRes.data : [];
  const tide = tideRes.ok && tideRes.data ? tideRes.data : null;

  const jets = jetsRes.ok && Array.isArray(jetsRes.data) ? jetsRes.data : [];
  const vessels = vesselRes.ok && Array.isArray(vesselRes.data) ? vesselRes.data : [];
  const chokepoints = chokepointRes.ok && Array.isArray(chokepointRes.data) ? chokepointRes.data : [];
  const conflicts = conflictRes.ok && Array.isArray(conflictRes.data) ? conflictRes.data : [];
  const energy = energyRes.ok && Array.isArray(energyRes.data) ? energyRes.data : [];
  const cyber = cyberRes.ok && Array.isArray(cyberRes.data) ? cyberRes.data : [];

  const allResults = [insiderRes, senateRes, darkPoolRes, optionsRes, tideRes, jetsRes, vesselRes, chokepointRes, conflictRes, energyRes, cyberRes];
  const hadError = allResults.some((r) => !r.ok);
  const hasLiveData = Boolean(insiders.length || senate.length || darkPool.length || options.length || tide || jets.length || vessels.length || chokepoints.length || conflicts.length || energy.length || cyber.length);

  if (hadError && cached && Date.now() - cached.savedAt < SNAPSHOT_STALE_MS) {
    return markCache(
      cached.snapshot,
      "stale",
      cached.savedAt,
      "AXE Intel is cooling down or rate-limited. Showing the last cached intel snapshot.",
    );
  }

  const providers: IntelProviderStatus[] = [
    toStatus(
      "insiderTrades",
      "Insider trades",
      "AXE Intel insider transaction feed",
      insiderRes.ok && insiders.length > 0,
      insiderRes.ok ? undefined : insiderRes.error,
    ),
    toStatus(
      "senateTrades",
      "Congress",
      "AXE Intel congressional disclosure feed",
      senateRes.ok && senate.length > 0,
      senateRes.ok ? undefined : senateRes.error,
    ),
    toStatus(
      "darkPoolPrints",
      "Dark pool",
      "AXE Intel off-exchange print feed",
      darkPoolRes.ok && darkPool.length > 0,
      darkPoolRes.ok ? undefined : darkPoolRes.error,
    ),
    toStatus(
      "unusualOptions",
      "Options flow",
      "AXE Intel smart-money options feed",
      optionsRes.ok && options.length > 0,
      optionsRes.ok ? undefined : optionsRes.error,
    ),
    toStatus(
      "marketTide",
      "Market tide",
      "AXE Intel net call/put premium tide",
      tideRes.ok && tide != null,
      tideRes.ok ? undefined : tideRes.error,
    ),
    toStatus(
      "corporateJets",
      "Corporate jets",
      "AXE Intel executive jet tracking (OpenSky)",
      jetsRes.ok && jets.length > 0,
      jetsRes.ok ? undefined : jetsRes.error,
    ),
    toStatus(
      "vesselTracking",
      "Vessel tracking",
      "AXE Intel supply chain & chokepoint monitoring",
      vesselRes.ok && vessels.length > 0,
      vesselRes.ok ? undefined : vesselRes.error,
    ),
    toStatus(
      "conflictEvents",
      "Conflict events",
      "AXE Intel geopolitical conflict feed (ACLED/GDELT)",
      conflictRes.ok && conflicts.length > 0,
      conflictRes.ok ? undefined : conflictRes.error,
    ),
    toStatus(
      "energyFlows",
      "Energy flows",
      "AXE Intel oil/gas inventory & pricing (EIA)",
      energyRes.ok && energy.length > 0,
      energyRes.ok ? undefined : energyRes.error,
    ),
    toStatus(
      "cyberThreats",
      "Cyber threats",
      "AXE Intel network scanning intelligence (GreyNoise)",
      cyberRes.ok && cyber.length > 0,
      cyberRes.ok ? undefined : cyberRes.error,
    ),
  ];

  const snapshot: IntelSnapshot = {
    generatedAt: new Date().toISOString(),
    insiders,
    senate,
    darkPool,
    options,
    tide,
    jets,
    vessels,
    chokepoints,
    conflicts,
    energy,
    cyber,
    providers,
    hasLiveData,
    cache: {
      state: hasLiveData ? "fresh" : "empty",
      ageSeconds: null,
      message: hasLiveData ? undefined : "No cached intel rows yet. AXE Intel will retry without exposing runtime errors.",
    },
  };

  if (hasLiveData) {
    snapshotCache.set((opts?.symbol ?? "market").toUpperCase(), {
      snapshot,
      savedAt: Date.now(),
    });
  }

  return snapshot;
}

function markCache(
  snapshot: IntelSnapshot,
  state: IntelSnapshot["cache"]["state"],
  savedAt: number,
  message?: string,
): IntelSnapshot {
  return {
    ...snapshot,
    cache: {
      state,
      ageSeconds: Math.max(0, Math.round((Date.now() - savedAt) / 1000)),
      message,
    },
  };
}
