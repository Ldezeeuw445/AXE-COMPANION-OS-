import "server-only";
import { getSupabaseKey } from "@/lib/env";
import {
  providerTile,
  staleReasonFromProxy,
  type IntelProviderState,
} from "@/lib/intel/providerStatus";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";

const REVALIDATE_SECONDS = 15 * 60; // Unusual Whales is expensive and slow-moving enough for 15 min cache.
const SNAPSHOT_FRESH_MS = 15 * 60 * 1000;
const SNAPSHOT_STALE_MS = 24 * 60 * 60 * 1000;
const INTEL_PROXY_TIMEOUT_MS = 12_000;

export type { IntelProviderState };

export type IntelProviderStatus = {
  id:
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
    | "cyberThreats"
    | "militaryRadar"
    | "emergencyMonitor";
  label: string;
  state: IntelProviderState;
  description?: string;
  /** Human-readable reason when state is stale/error/off. */
  reason?: string;
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

/**
 * Off-exchange activity. Single dark pool prints only exist in paid feeds; the
 * shared intel-proxy serves FINRA's daily off-exchange (short) volume per
 * symbol instead, marked `kind: "finra_short_volume"`. Older rows (and the
 * table fallback) still carry price / size / notional per print.
 */
export type DarkPoolPrint = {
  symbol: string;
  price?: number;
  size?: number;
  notional?: number;
  side?: "buy" | "sell" | "neutral";
  /** HH:MM stamp from the proxy. */
  time?: string;
  kind?: "finra_short_volume";
  shortVolume?: number;
  totalVolume?: number;
  shortPct?: number;
  /** FINRA trading day, YYYY-MM-DD. */
  date?: string;
};

export function isOffExchangeVolume(row: DarkPoolPrint): boolean {
  return row.kind === "finra_short_volume" || (typeof row.totalVolume === "number" && typeof row.price !== "number");
}

function compactNumber(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

/**
 * One plain line for AXE's context, for either shape:
 * "SPY: 17.60M shares off-exchange, 42.7% short (FINRA, 2026-11-06)" or
 * "NVDA: $192.50 × 1,200 = $230.4K (buy)". Never reads a field the row lacks.
 */
export function describeDarkPoolRow(p: DarkPoolPrint): string {
  if (isOffExchangeVolume(p)) {
    const vol = typeof p.totalVolume === "number" ? `${compactNumber(p.totalVolume)} shares off-exchange` : "off-exchange volume";
    const short = typeof p.shortPct === "number" ? `, ${p.shortPct.toFixed(1)}% short` : "";
    return `${p.symbol}: ${vol}${short} (FINRA${p.date ? `, ${p.date}` : ""})`;
  }
  const price = typeof p.price === "number" ? `$${p.price.toFixed(2)}` : "";
  const size = typeof p.size === "number" ? ` × ${p.size.toLocaleString()}` : "";
  const notional = typeof p.notional === "number" ? ` = $${compactNumber(p.notional)}` : "";
  return `${p.symbol}: ${price}${size}${notional}${p.side ? ` (${p.side})` : ""}`;
}

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

/* ── Military & Emergency Types ────────────────────────────────── */

export type MilitaryAircraft = {
  hex: string;
  registration: string;
  aircraftType: string;
  callsign: string;
  altitude: number | null;
  groundSpeed: number | null;
  latitude: number | null;
  longitude: number | null;
  onGround: boolean;
  category: string;
  lastSeen: string;
};

export type EmergencySquawk = {
  hex: string;
  registration: string;
  aircraftType: string;
  callsign: string;
  squawk: string;
  altitude: number | null;
  groundSpeed: number | null;
  latitude: number | null;
  longitude: number | null;
  onGround: boolean;
  lastSeen: string;
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
  military: MilitaryAircraft[];
  emergency: EmergencySquawk[];
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
  | "cyberThreats"
  | "militaryRadar"
  | "emergencyMonitor";

/** `staleReason` is set when the proxy served cached rows because live sources failed. */
type IntelEnvelope<T> =
  | { ok: true; data: T; staleReason?: string }
  | { ok: false; error: string };

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

/**
 * What this app calls a feed, versus what the deployed intel-proxy calls it.
 *
 * The proxy's own whitelist is the authority (`PUBLIC_INTEL_ACTIONS` in the Edge
 * function). It was renamed at some point and this map was left empty, so two
 * live feeds were being asked for under names the proxy no longer knows. An
 * unknown action does not come back as "unknown action": the proxy only skips
 * its auth check for names on that whitelist, so anything else is sent through
 * `getUser(<anon key>)` and answers `invalid_token`. That 401 read like a
 * credential problem for months while the keys behind it were fine.
 */
const PROXY_ACTION_MAP: Partial<Record<IntelAction, string>> = {
  vesselTracking: "vesselStream",
  conflictEvents: "gdeltEvents",
};

/**
 * Feeds served straight from their tables, never from the proxy. Empty now:
 * the shared intel-proxy (deployed from Ldezeeuw445/trading-os-app, the one
 * function for both apps) serves energyFlows (EIA), cyberThreats (CISA KEV),
 * militaryRadar and emergencyMonitor (adsb.lol). Their old tables are only a
 * fallback while a proxy without those handlers is still deployed.
 */
const PROXY_UNSUPPORTED_ACTIONS = new Set<IntelAction>([]);

/** Alt-data feeds the shared proxy serves; their old tables are only a fallback. */
type LiveAltFeed = "energyFlows" | "cyberThreats" | "militaryRadar" | "emergencyMonitor";

/** How old a retired feed's newest row may be before the tile stops claiming it. */
const RETIRED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function mapProxyVesselRow(row: Record<string, unknown>): VesselTrack {
  const ownerType = String(row.ownerType ?? "unknown");
  const alertLevel = String(row.alertLevel ?? "normal");
  const mmsi = String(row.mmsi ?? "");
  let owner = String(row.owner ?? "");
  // Fallback to fleet meta if owner missing
  if (!owner && mmsi && VESSEL_FLEET_META[mmsi]) {
    owner = VESSEL_FLEET_META[mmsi].owner;
  }
  if (!owner) owner = "—";

  return {
    mmsi: mmsi,
    vesselName: String(row.vesselName ?? row.name ?? "Unknown"),
    vesselType: String(row.vesselType ?? row.type ?? "Vessel"),
    owner,
    ownerType:
      ownerType === "corporate" || ownerType === "state" || ownerType === "oligarch"
        ? ownerType
        : "unknown",
    significance: String(row.significance ?? ""),
    isTracked: row.isTracked !== false,
    lastSeen: row.lastSeen != null ? String(row.lastSeen) : null,
    lastLatitude:
      typeof row.lastLatitude === "number"
        ? row.lastLatitude
        : typeof row.lat === "number"
          ? row.lat
          : typeof row.latitude === "number"
            ? row.latitude
            : null,
    lastLongitude:
      typeof row.lastLongitude === "number"
        ? row.lastLongitude
        : typeof row.lon === "number"
          ? row.lon
          : typeof row.longitude === "number"
            ? row.longitude
            : null,
    speedKnots:
      typeof row.speedKnots === "number"
        ? row.speedKnots
        : typeof row.speed === "number"
          ? row.speed
          : null,
    heading: typeof row.heading === "number" ? row.heading : null,
    destination: row.destination != null ? String(row.destination) : null,
    nearChokepoint: row.nearChokepoint != null ? String(row.nearChokepoint) : null,
    alertLevel:
      alertLevel === "warning" || alertLevel === "critical" ? alertLevel : "normal",
  };
}

/** Static chokepoints are served locally; all other feeds hit intel-proxy first. */
const DB_ONLY_ACTIONS = new Set<IntelAction>(["chokepoints"]);

const STATIC_CHOKEPOINTS: Chokepoint[] = [
  {
    id: 1,
    name: "Strait of Hormuz",
    region: "Middle East / Persian Gulf",
    latitude: 26.5667,
    longitude: 56.25,
    radiusNm: 60,
    riskLevel: "critical",
    riskFactors: "Iran tensions, oil tanker risk. ~21% of global oil transit.",
    dailyShipCount: 65,
    percentageGlobalTrade: 21,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 2,
    name: "Strait of Malacca",
    region: "Southeast Asia",
    latitude: 2.5,
    longitude: 101.5,
    radiusNm: 80,
    riskLevel: "medium",
    riskFactors: "Piracy risk, China-ASEAN tensions. ~25% of global trade.",
    dailyShipCount: 83,
    percentageGlobalTrade: 25,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 3,
    name: "Suez Canal",
    region: "Egypt / Mediterranean",
    latitude: 30.4167,
    longitude: 32.3444,
    radiusNm: 40,
    riskLevel: "high",
    riskFactors: "Canal blockage risk, Red Sea spillover.",
    dailyShipCount: 52,
    percentageGlobalTrade: 12,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 4,
    name: "Bab-el-Mandeb Strait",
    region: "Yemen / Horn of Africa",
    latitude: 12.5833,
    longitude: 43.3167,
    radiusNm: 50,
    riskLevel: "critical",
    riskFactors: "Active shipping attacks; major Red Sea reroutes.",
    dailyShipCount: 48,
    percentageGlobalTrade: 10,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 5,
    name: "Taiwan Strait",
    region: "East Asia",
    latitude: 24.25,
    longitude: 119.5,
    radiusNm: 70,
    riskLevel: "high",
    riskFactors: "China-Taiwan tensions; semiconductor supply chain risk.",
    dailyShipCount: 55,
    percentageGlobalTrade: 8,
    updatedAt: new Date().toISOString(),
  },
];

const VESSEL_FLEET_META: Record<
  string,
  { owner: string; ownerType: VesselTrack["ownerType"]; significance: string }
> = {
  "477552700": { owner: "Evergreen Marine", ownerType: "corporate", significance: "Ever Given — Suez supply chain bellwether" },
  "371785000": { owner: "MSC", ownerType: "corporate", significance: "MSC Gülsün class mega container" },
  "353136000": { owner: "HMM", ownerType: "corporate", significance: "Largest South Korean container vessel" },
  "477333400": { owner: "Evergreen Marine", ownerType: "corporate", significance: "24k+ TEU mega container" },
  "228039600": { owner: "CMA CGM", ownerType: "corporate", significance: "French flagship mega container" },
  "636092799": { owner: "Advantage Tankers", ownerType: "corporate", significance: "Iran seizure flashpoint tanker" },
  "564421000": { owner: "Eastern Pacific", ownerType: "corporate", significance: "Red Sea / Oman attack history" },
  "538004315": { owner: "Trafigura", ownerType: "corporate", significance: "Houthi missile target Jan 2024" },
  "319190200": { owner: "Jeff Bezos", ownerType: "oligarch", significance: "Koru megayacht" },
  "319085100": { owner: "Unknown Billionaire", ownerType: "oligarch", significance: "Flying Fox charter megayacht" },
  "319178900": { owner: "US DOJ (seized)", ownerType: "state", significance: "Seized oligarch yacht" },
  "319013600": { owner: "Alisher Usmanov", ownerType: "oligarch", significance: "Dilbar — sanctions indicator" },
  "319866000": { owner: "Roman Abramovich", ownerType: "oligarch", significance: "Eclipse — oligarch bellwether" },
  "319174000": { owner: "Unknown (Putin-linked)", ownerType: "oligarch", significance: "Scheherazade — seized in Italy" },
};

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestChokepointForVessel(lat: number, lon: number): string | null {
  let best: { name: string; dist: number } | null = null;
  for (const cp of STATIC_CHOKEPOINTS) {
    const dist = haversineNm(lat, lon, cp.latitude, cp.longitude);
    if (dist > cp.radiusNm * 2.5) continue;
    if (!best || dist < best.dist) best = { name: cp.name, dist };
  }
  return best?.name ?? null;
}

function mapProxyJetRow(row: Record<string, unknown>): CorporateJet {
  // Prefer several possible source fields for human-friendly company/operator name
  const callsign = String(row.callsign ?? row.aircraft ?? "UNKNOWN");
  const rawCompany = (row.company ?? row.operator ?? row.owner ?? row.owner_name ?? "") as unknown;
  let company = rawCompany ? String(rawCompany) : "";
  // Fallback: if company missing, try to infer from callsign (common prefixes) or registration
  if (!company) {
    const cs = callsign.toUpperCase();
    // common operator prefixes mapping (small heuristic)
    const prefixMap: Record<string, string> = {
      DAL: "Delta Airlines",
      AAL: "American Airlines",
      UAL: "United Airlines",
      RYR: "Ryanair",
      TLS: "Tesla",
      GFA: "Gulfstream",
    };
    const prefix = cs.slice(0, 3);
    if (prefix in prefixMap) company = prefixMap[prefix];
  }
  if (!company) company = String(row.company ?? "Unknown");

  return {
    icao24: String(row.icao24 ?? ""),
    callsign,
    company,
    ticker: String(row.ticker ?? "—"),
    tailNumber: String(row.tailNumber ?? row.tail ?? "—").trim() || "—",
    originCountry: String(row.originCountry ?? row.origin_country ?? row.country ?? "Unknown"),
    latitude: typeof row.latitude === "number" ? row.latitude : typeof row.lat === "number" ? row.lat : Number(row.lat) || null,
    longitude: typeof row.longitude === "number" ? row.longitude : typeof row.lon === "number" ? row.lon : Number(row.lon) || null,
    altitude: typeof row.altitude === "number" ? row.altitude : null,
    velocity: typeof row.velocity === "number" ? row.velocity : typeof row.speed === "number" ? row.speed : null,
    onGround: row.onGround === true || row.on_ground === true || row.grounded === true,
  };
}

function mapGdeltToConflict(row: Record<string, unknown>, i: number): ConflictEvent {
  return {
    eventId: `gdelt:${i}:${String(row.url ?? row.title ?? i).slice(0, 40)}`,
    eventDate: String(row.date ?? row.seendate ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10),
    country: String(row.country ?? "—"),
    region: String(row.country ?? "—"),
    eventType: "Conflict",
    subEventType: "GDELT",
    actor1: "—",
    fatalities: 0,
    notes: String(row.title ?? ""),
    latitude: typeof row.lat === "number" ? row.lat : null,
    longitude: typeof row.lon === "number" ? row.lon : null,
  };
}

/** Pass through intel-proxy conflict rows; only legacy GDELT-shaped payloads get remapped. */
function mapProxyConflictRow(row: Record<string, unknown>, i: number): ConflictEvent {
  const hasProxyShape =
    row.eventId != null ||
    row.event_id != null ||
    row.eventType != null ||
    row.event_type != null;

  if (hasProxyShape) {
    return {
      eventId: String(row.eventId ?? row.event_id ?? i),
      eventDate: String(row.eventDate ?? row.event_date ?? "").slice(0, 10),
      country: String(row.country ?? "—"),
      region: String(row.region ?? row.country ?? "—"),
      eventType: String(row.eventType ?? row.event_type ?? "Event"),
      subEventType: String(row.subEventType ?? row.sub_event_type ?? ""),
      actor1: String(row.actor1 ?? ""),
      fatalities: Number(row.fatalities ?? 0),
      notes: String(row.notes ?? "").slice(0, 300),
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
    };
  }

  return mapGdeltToConflict(row, i);
}

function normalizeProxyPayload<T>(action: IntelAction, raw: unknown): T {
  if (action === "corporateJets" && Array.isArray(raw)) {
    return raw.map((row) => mapProxyJetRow(row as Record<string, unknown>)) as T;
  }
  if (action === "vesselTracking" && Array.isArray(raw)) {
    return raw.map((row) => mapProxyVesselRow(row as Record<string, unknown>)) as T;
  }
  if (action === "vesselTracking" && raw && typeof raw === "object" && !Array.isArray(raw)) {
    const vessels = (raw as { vessels?: unknown[] }).vessels;
    if (Array.isArray(vessels)) {
      return vessels.map((row) => mapProxyVesselRow(row as Record<string, unknown>)) as T;
    }
  }
  if (action === "conflictEvents" && Array.isArray(raw)) {
    return raw.map((row, i) => mapProxyConflictRow(row as Record<string, unknown>, i)) as T;
  }
  return raw as T;
}

async function loadIntelFromDbTables<T>(
  action: IntelAction,
  args: Record<string, unknown>,
): Promise<IntelEnvelope<T>> {
  const sb = createServiceRoleSupabaseClient();
  if (!sb) return { ok: false, error: "intel_db_unavailable" };

  try {
    switch (action) {
      case "insiderTrades": {
        let q = sb
          .from("intel_insider_trades")
          .select("ticker,insider_name,insider_role,trade_type,shares,total_value,trade_date")
          .order("trade_date", { ascending: false })
          .limit(40);
        if (typeof args.symbol === "string" && args.symbol.trim()) {
          q = q.eq("ticker", String(args.symbol).toUpperCase());
        }
        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };
        const rows = (data ?? []).map((r) => ({
          ticker: r.ticker,
          insider: r.insider_role ? `${r.insider_name} · ${r.insider_role}` : r.insider_name,
          type: r.trade_type as "BUY" | "SELL",
          shares: r.shares ?? undefined,
          value: Number(r.total_value ?? 0),
          date: String(r.trade_date),
        }));
        return { ok: true, data: rows as T };
      }
      case "senateTrades": {
        const { data, error } = await sb
          .from("intel_congress_trades")
          .select("politician,chamber,ticker,trade_type,amount_range,trade_date")
          .order("trade_date", { ascending: false })
          .limit(40);
        if (error) return { ok: false, error: error.message };
        const rows = (data ?? []).map((r) => ({
          politician: r.politician,
          chamber: r.chamber,
          ticker: r.ticker,
          direction: r.trade_type as "BUY" | "SELL",
          size: r.amount_range ?? "—",
          date: String(r.trade_date),
        }));
        return { ok: true, data: rows as T };
      }
      case "darkPoolPrints": {
        let q = sb
          .from("intel_dark_pool")
          .select("symbol,price,block_size,notional,side,snapshot_time")
          .order("snapshot_time", { ascending: false })
          .limit(50);
        if (typeof args.symbol === "string" && args.symbol.trim()) {
          q = q.eq("symbol", String(args.symbol).toUpperCase());
        }
        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };
        const rows = (data ?? []).map((r) => ({
          symbol: r.symbol,
          price: Number(r.price),
          size: r.block_size,
          notional: Number(r.notional),
          side: (r.side as DarkPoolPrint["side"]) ?? undefined,
          time: r.snapshot_time ? String(r.snapshot_time).slice(11, 16) : undefined,
        }));
        return { ok: true, data: rows as T };
      }
      case "unusualOptions": {
        let q = sb
          .from("intel_unusual_options")
          .select("symbol,strike,expiry,volume,open_interest,side,premium,is_sweep,rule")
          .order("snapshot_time", { ascending: false })
          .limit(25);
        if (typeof args.symbol === "string" && args.symbol.trim()) {
          q = q.eq("symbol", String(args.symbol).toUpperCase());
        }
        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };
        const rows = (data ?? []).map((r) => ({
          symbol: r.symbol,
          strike: Number(r.strike),
          exp: String(r.expiry),
          vol: r.volume,
          oi: r.open_interest,
          side: r.side as "CALL" | "PUT",
          premium: Number(r.premium),
          sweep: Boolean(r.is_sweep),
          rule: r.rule,
        }));
        return { ok: true, data: rows as T };
      }
      case "marketTide": {
        const { data, error } = await sb
          .from("intel_market_tide")
          .select("net_call_premium,net_put_premium,call_put_ratio,bias,snapshot_time")
          .order("snapshot_time", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: true, data: null as T };
        return {
          ok: true,
          data: {
            timestamp: String(data.snapshot_time),
            netCallPremium: Number(data.net_call_premium),
            netPutPremium: Number(data.net_put_premium),
            callPutRatio: Number(data.call_put_ratio),
            bias: data.bias as MarketTide["bias"],
          } as T,
        };
      }
      case "vesselTracking": {
        const { data, error } = await sb
          .from("intel_vessel_tracking")
          .select("mmsi,vessel_name,vessel_type,latitude,longitude,speed,destination,region,snapshot_time")
          .order("snapshot_time", { ascending: false })
          .limit(300);
        if (error) return { ok: false, error: error.message };
        const seen = new Set<string>();
        const rows: VesselTrack[] = [];
        for (const r of data ?? []) {
          const mmsi = String(r.mmsi ?? "");
          if (!mmsi || seen.has(mmsi)) continue;
          seen.add(mmsi);
          const fleet = VESSEL_FLEET_META[mmsi];
          const lat = r.latitude != null ? Number(r.latitude) : null;
          const lon = r.longitude != null ? Number(r.longitude) : null;
          const nearFromCoords =
            lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)
              ? nearestChokepointForVessel(lat, lon)
              : null;
          rows.push({
            mmsi,
            vesselName: String(r.vessel_name ?? mmsi),
            vesselType: String(r.vessel_type ?? "Vessel"),
            owner: fleet?.owner ?? "—",
            ownerType: fleet?.ownerType ?? "unknown",
            significance: fleet?.significance ?? "",
            isTracked: lat != null && lon != null,
            lastSeen: r.snapshot_time ? String(r.snapshot_time) : null,
            lastLatitude: lat,
            lastLongitude: lon,
            speedKnots: r.speed != null ? Number(r.speed) : null,
            heading: null,
            destination: r.destination ? String(r.destination) : null,
            nearChokepoint: nearFromCoords ?? (r.region ? String(r.region) : null),
            alertLevel: "normal",
          });
        }
        return { ok: true, data: rows as T };
      }
      case "chokepoints":
        return { ok: true, data: STATIC_CHOKEPOINTS as T };
      case "conflictEvents": {
        const { data, error } = await sb
          .from("intel_conflict_events")
          .select("event_id,event_date,country,region,event_type,sub_event_type,actor1,fatalities,notes,latitude,longitude")
          .order("snapshot_time", { ascending: false })
          .limit(40);
        if (error) return { ok: false, error: error.message };
        const rows = (data ?? []).map((r) => ({
          eventId: r.event_id,
          eventDate: r.event_date,
          country: r.country,
          region: r.region,
          eventType: r.event_type,
          subEventType: r.sub_event_type,
          actor1: r.actor1,
          fatalities: r.fatalities ?? 0,
          notes: r.notes ?? "",
          latitude: r.latitude,
          longitude: r.longitude,
        }));
        return { ok: true, data: rows as T };
      }
      case "energyFlows": {
        const { data, error } = await sb
          .from("intel_energy_flows")
          .select("series_id,series_name,period,value,unit")
          .order("snapshot_time", { ascending: false })
          .limit(30);
        if (error) return { ok: false, error: error.message };
        const rows = (data ?? []).map((r) => ({
          seriesId: r.series_id,
          seriesName: r.series_name,
          period: r.period,
          value: r.value,
          unit: r.unit,
        }));
        return { ok: true, data: rows as T };
      }
      case "cyberThreats": {
        const { data, error } = await sb
          .from("intel_cyber_threats")
          .select("ip,classification,name,noise,riot,last_seen,tags,category")
          .order("snapshot_time", { ascending: false })
          .limit(30);
        if (error) return { ok: false, error: error.message };
        const rows = (data ?? []).map((r) => ({
          ip: r.ip,
          classification: r.classification,
          name: r.name,
          noise: Boolean(r.noise),
          riot: Boolean(r.riot),
          lastSeen: r.last_seen,
          tags: r.tags ?? [],
          category: r.category,
        }));
        return { ok: true, data: rows as T };
      }
      case "militaryRadar": {
        const { data, error } = await sb
          .from("intel_military_radar")
          .select("hex,registration,aircraft_type,callsign,altitude,ground_speed,latitude,longitude,on_ground,category,last_seen")
          .order("snapshot_time", { ascending: false })
          .limit(50);
        if (error) return { ok: false, error: error.message };
        const rows = (data ?? []).map((r) => ({
          hex: r.hex,
          registration: r.registration ?? "",
          aircraftType: r.aircraft_type ?? "",
          callsign: r.callsign ?? "",
          altitude: r.altitude,
          groundSpeed: r.ground_speed,
          latitude: r.latitude,
          longitude: r.longitude,
          onGround: Boolean(r.on_ground),
          category: r.category ?? "",
          lastSeen: r.last_seen ? String(r.last_seen) : new Date().toISOString(),
        }));
        return { ok: true, data: rows as T };
      }
      case "emergencyMonitor": {
        const { data, error } = await sb
          .from("intel_emergency_monitor")
          .select("hex,registration,aircraft_type,callsign,squawk,altitude,ground_speed,latitude,longitude,on_ground,last_seen")
          .order("snapshot_time", { ascending: false })
          .limit(30);
        if (error) return { ok: false, error: error.message };
        const rows = (data ?? []).map((r) => ({
          hex: r.hex,
          registration: r.registration ?? "",
          aircraftType: r.aircraft_type ?? "",
          callsign: r.callsign ?? "",
          squawk: r.squawk ?? "",
          altitude: r.altitude,
          groundSpeed: r.ground_speed,
          latitude: r.latitude,
          longitude: r.longitude,
          onGround: Boolean(r.on_ground),
          lastSeen: r.last_seen ? String(r.last_seen) : new Date().toISOString(),
        }));
        return { ok: true, data: rows as T };
      }
      default:
        return { ok: false, error: "intel_db_unsupported_action" };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function callIntelProxy<T>(
  action: IntelAction,
  args: Record<string, unknown> = {},
  opts: { dbFallback?: boolean } = {},
): Promise<IntelEnvelope<T>> {
  const dbFallback = opts.dbFallback ?? true;
  const loadIntelFromDb = <U>(a: IntelAction, x: Record<string, unknown>): Promise<IntelEnvelope<U>> =>
    dbFallback ? loadIntelFromDbTables<U>(a, x) : Promise.resolve({ ok: false, error: "no_db_fallback" });
  if (DB_ONLY_ACTIONS.has(action)) {
    const db = await loadIntelFromDb<T>(action, args);
    if (db.ok) return db;
  }

  // No handler upstream: the only thing a request can earn here is a 401.
  if (PROXY_UNSUPPORTED_ACTIONS.has(action)) {
    return loadIntelFromDb<T>(action, args);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = getSupabaseKey();
  if (!url || !anonKey) {
    const db = await loadIntelFromDb<T>(action, args);
    return db.ok ? db : { ok: false, error: "missing_supabase_env" };
  }

  const proxyAction = PROXY_ACTION_MAP[action] ?? action;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), INTEL_PROXY_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/functions/v1/intel-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      signal: ctrl.signal,
      body: JSON.stringify({ action: proxyAction, args }),
      next: { revalidate: REVALIDATE_SECONDS, tags: [`intel:${action}`] },
    });
    if (!res.ok) {
      const db = await loadIntelFromDb<T>(action, args);
      if (db.ok) return db;
      const body = await res.text().catch(() => "");
      return { ok: false, error: `intel_proxy_${res.status}:${body.slice(0, 120)}` };
    }
    const json = (await res.json()) as {
      ok?: boolean;
      data?: unknown;
      error?: string;
      message?: string;
      source?: unknown;
      unavailable?: unknown;
    };
    if (!json.ok) {
      const db = await loadIntelFromDb<T>(action, args);
      if (db.ok) return db;
      const unavailable =
        Array.isArray(json.unavailable) && json.unavailable.length > 0
          ? ` (${json.unavailable.slice(0, 3).join("; ")})`
          : "";
      return {
        ok: false,
        error: `${json.message ?? json.error ?? "intel_proxy_unknown_error"}${unavailable}`,
      };
    }
    const normalized = normalizeProxyPayload<T>(action, json.data);
    if (action === "marketTide" && (normalized == null || normalized === undefined)) {
      const db = await loadIntelFromDb<T>(action, args);
      if (db.ok && db.data != null) return db;
    }
    if (
      Array.isArray(normalized) &&
      normalized.length === 0 &&
      !DB_ONLY_ACTIONS.has(action)
    ) {
      const db = await loadIntelFromDb<T>(action, args);
      if (db.ok && Array.isArray(db.data) && db.data.length > 0) return db;
    }
    const staleReason = staleReasonFromProxy(json);
    return staleReason
      ? { ok: true, data: normalized, staleReason }
      : { ok: true, data: normalized };
  } catch (e) {
    const db = await loadIntelFromDb<T>(action, args);
    if (db.ok) return db;
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, error: `intel_proxy_timeout_${INTEL_PROXY_TIMEOUT_MS}ms` };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Table behind each retired feed, for the one freshness question we ask of it. */
const RETIRED_FEED_TABLE: Record<string, string> = {
  energyFlows: "intel_energy_flows",
  cyberThreats: "intel_cyber_threats",
  militaryRadar: "intel_military_radar",
  emergencyMonitor: "intel_emergency_monitor",
};

/**
 * When a retired feed last received a row, or null if we cannot tell.
 *
 * Row count is not evidence of a working feed. These tables are full and idle,
 * and without this check the tiles read "live" off rows from July.
 */
async function newestRetiredSnapshot(action: IntelAction): Promise<number | null> {
  const table = RETIRED_FEED_TABLE[action];
  if (!table) return null;
  const sb = createServiceRoleSupabaseClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from(table)
      .select("snapshot_time")
      .order("snapshot_time", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data?.snapshot_time) return null;
    const t = Date.parse(String(data.snapshot_time));
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

/**
 * A tile for a feed with no live source behind it.
 *
 * Deliberately not "error" and not "feed syncing…": nothing is syncing and
 * nothing is broken in this app. The feed is gone from the proxy, and saying so
 * is better than a spinner that will never resolve.
 */
function retiredStatus(
  id: IntelProviderStatus["id"],
  label: string,
  description: string,
  newestAt: number | null,
): IntelProviderStatus {
  const age = newestAt == null ? null : Date.now() - newestAt;
  if (age != null && age < RETIRED_MAX_AGE_MS) {
    return { id, label, state: "live", description };
  }
  const last = newestAt == null ? "never" : new Date(newestAt).toISOString().slice(0, 10);
  return {
    id,
    label,
    state: "off",
    description: `${description} — no live source (last data ${last})`,
  };
}

function toStatus(
  id: IntelProviderStatus["id"],
  label: string,
  description: string,
  ok: boolean,
  err?: string,
  staleReason?: string,
): IntelProviderStatus {
  return providerTile(id, label, description, ok, err, staleReason);
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

/**
 * One alt-data feed: live from the shared proxy, or — while a proxy without
 * this handler is still deployed — its old table, shown only while young.
 */
async function loadAltFeed<T>(
  action: LiveAltFeed,
  label: string,
  description: string,
): Promise<{ rows: T[]; status: IntelProviderStatus }> {
  const live = await callIntelProxy<T[]>(action, {}, { dbFallback: false });
  if (live.ok && Array.isArray(live.data)) {
    // An empty list is a real answer here (no aircraft squawking 7700 is good news).
    return { rows: live.data, status: { id: action, label, state: "live", description } };
  }
  const [db, newestAt] = await Promise.all([loadIntelFromDbTables<T[]>(action, {}), newestRetiredSnapshot(action)]);
  const fresh = newestAt != null && Date.now() - newestAt < RETIRED_MAX_AGE_MS;
  return {
    rows: fresh && db.ok && Array.isArray(db.data) ? db.data : [],
    status: retiredStatus(action, label, description, newestAt),
  };
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
  // Energy (EIA), cyber (CISA KEV), military and emergency aircraft (adsb.lol)
  // come from the shared intel-proxy; the old tables only stand in until that
  // proxy is deployed.
  const energyFeed = await loadAltFeed<EnergyFlow>("energyFlows", "Energy flows", "EIA crude, gas and fuel stocks and prices");
  const cyberFeed = await loadAltFeed<CyberThreat>("cyberThreats", "Cyber threats", "CISA known exploited vulnerabilities");
  const militaryFeed = await loadAltFeed<MilitaryAircraft>("militaryRadar", "Military radar", "Military aircraft on ADS-B (adsb.lol)");
  const emergencyFeed = await loadAltFeed<EmergencySquawk>(
    "emergencyMonitor",
    "Emergency monitor",
    "Aircraft squawking 7500 / 7600 / 7700 (adsb.lol)",
  );

  const insiders = insiderRes.ok && Array.isArray(insiderRes.data) ? insiderRes.data : [];
  const senate = senateRes.ok && Array.isArray(senateRes.data) ? senateRes.data : [];
  const darkPool = darkPoolRes.ok && Array.isArray(darkPoolRes.data) ? darkPoolRes.data : [];
  const options = optionsRes.ok && Array.isArray(optionsRes.data) ? optionsRes.data : [];
  const tide = tideRes.ok && tideRes.data ? tideRes.data : null;

  const jets = jetsRes.ok && Array.isArray(jetsRes.data) ? jetsRes.data : [];
  const vessels = vesselRes.ok && Array.isArray(vesselRes.data) ? vesselRes.data : [];
  const chokepoints = chokepointRes.ok && Array.isArray(chokepointRes.data) ? chokepointRes.data : [];
  const conflicts = conflictRes.ok && Array.isArray(conflictRes.data) ? conflictRes.data : [];

  const energyLive = energyFeed.rows;
  const cyberLive = cyberFeed.rows;
  const militaryLive = militaryFeed.rows;
  const emergencyLive = emergencyFeed.rows;

  // The alt-data feeds are excluded: one of them failing must not pin the page
  // to a stale snapshot of the market feeds.
  const allResults = [insiderRes, senateRes, darkPoolRes, optionsRes, tideRes, jetsRes, vesselRes, chokepointRes, conflictRes];
  const hadError = allResults.some((r) => !r.ok);
  const hasLiveData = Boolean(insiders.length || senate.length || darkPool.length || options.length || tide || jets.length || vessels.length || chokepoints.length || conflicts.length || energyLive.length || cyberLive.length || militaryLive.length);

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
      insiderRes.ok ? insiderRes.staleReason : undefined,
    ),
    toStatus(
      "senateTrades",
      "Congress",
      "AXE Intel congressional disclosure feed",
      senateRes.ok && senate.length > 0,
      senateRes.ok ? undefined : senateRes.error,
      senateRes.ok ? senateRes.staleReason : undefined,
    ),
    toStatus(
      "darkPoolPrints",
      "Dark pool",
      "AXE Intel off-exchange print feed",
      darkPoolRes.ok && darkPool.length > 0,
      darkPoolRes.ok ? undefined : darkPoolRes.error,
      darkPoolRes.ok ? darkPoolRes.staleReason : undefined,
    ),
    toStatus(
      "unusualOptions",
      "Options flow",
      "AXE Intel smart-money options feed",
      optionsRes.ok && options.length > 0,
      optionsRes.ok ? undefined : optionsRes.error,
      optionsRes.ok ? optionsRes.staleReason : undefined,
    ),
    toStatus(
      "marketTide",
      "Market tide",
      "AXE Intel net call/put premium tide",
      tideRes.ok && tide != null,
      tideRes.ok ? undefined : tideRes.error,
      tideRes.ok ? tideRes.staleReason : undefined,
    ),
    toStatus(
      "corporateJets",
      "Corporate jets",
      "AXE Intel executive mobility tracking",
      jetsRes.ok && jets.length > 0,
      jetsRes.ok ? undefined : jetsRes.error,
      jetsRes.ok ? jetsRes.staleReason : undefined,
    ),
    toStatus(
      "vesselTracking",
      "Vessel tracking",
      "AXE Intel supply chain & chokepoint monitoring",
      vesselRes.ok && vessels.length > 0,
      vesselRes.ok ? undefined : vesselRes.error,
      vesselRes.ok ? vesselRes.staleReason : undefined,
    ),
    toStatus(
      "chokepoints",
      "Chokepoints",
      "AXE Intel global chokepoint monitoring",
      chokepointRes.ok && chokepoints.length > 0,
      chokepointRes.ok ? undefined : chokepointRes.error,
      chokepointRes.ok ? chokepointRes.staleReason : undefined,
    ),
    toStatus(
      "conflictEvents",
      "Seismic events",
      "AXE Intel geopolitical & seismic events",
      conflictRes.ok && conflicts.length > 0,
      conflictRes.ok ? undefined : conflictRes.error,
      conflictRes.ok ? conflictRes.staleReason : undefined,
    ),
    energyFeed.status,
    cyberFeed.status,
    militaryFeed.status,
    emergencyFeed.status,
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
    energy: energyLive,
    cyber: cyberLive,
    military: militaryLive,
    emergency: emergencyLive,
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
