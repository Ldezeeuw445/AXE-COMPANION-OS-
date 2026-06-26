import "server-only";
import { getSupabaseKey } from "@/lib/env";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";

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
    | "chokepoints"
    | "conflictEvents"
    | "energyFlows"
    | "cyberThreats"
    | "militaryRadar"
    | "emergencyMonitor";
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

/** Deployed intel-proxy action aliases (legacy names only). */
const PROXY_ACTION_MAP: Partial<Record<IntelAction, string>> = {};

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
    return raw.map((row, i) => mapGdeltToConflict(row as Record<string, unknown>, i)) as T;
  }
  return raw as T;
}

async function loadIntelFromDb<T>(
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
): Promise<IntelEnvelope<T>> {
  if (DB_ONLY_ACTIONS.has(action)) {
    const db = await loadIntelFromDb<T>(action, args);
    if (db.ok) return db;
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
    const json = (await res.json()) as { ok?: boolean; data?: unknown; error?: string };
    if (!json.ok) {
      const db = await loadIntelFromDb<T>(action, args);
      if (db.ok) return db;
      return { ok: false, error: json.error ?? "intel_proxy_unknown_error" };
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
    return { ok: true, data: normalized };
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
      description: `${description} — feed syncing…`,
    };
  }
  return {
    id,
    label,
    state: "off",
    description: `${description} — waiting for new signals…`,
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

  // Military & Emergency feeds — same ADS-B Exchange subscription as jets
  const militaryRes = await callIntelProxy<MilitaryAircraft[]>("militaryRadar", {});
  const emergencyRes = await callIntelProxy<EmergencySquawk[]>("emergencyMonitor", {});

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
  const military = militaryRes.ok && Array.isArray(militaryRes.data) ? militaryRes.data : [];
  const emergency = emergencyRes.ok && Array.isArray(emergencyRes.data) ? emergencyRes.data : [];

  const allResults = [insiderRes, senateRes, darkPoolRes, optionsRes, tideRes, jetsRes, vesselRes, chokepointRes, conflictRes, energyRes, cyberRes, militaryRes, emergencyRes];
  const hadError = allResults.some((r) => !r.ok);
  const hasLiveData = Boolean(insiders.length || senate.length || darkPool.length || options.length || tide || jets.length || vessels.length || chokepoints.length || conflicts.length || energy.length || cyber.length || military.length);

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
      "AXE Intel executive mobility tracking",
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
      "chokepoints",
      "Chokepoints",
      "AXE Intel global chokepoint monitoring",
      chokepointRes.ok && chokepoints.length > 0,
      chokepointRes.ok ? undefined : chokepointRes.error,
    ),
    toStatus(
      "conflictEvents",
      "Seismic events",
      "AXE Intel geopolitical & seismic events",
      conflictRes.ok && conflicts.length > 0,
      conflictRes.ok ? undefined : conflictRes.error,
    ),
    toStatus(
      "energyFlows",
      "Energy flows",
      "AXE Intel energy inventory & pricing",
      energyRes.ok && energy.length > 0,
      energyRes.ok ? undefined : energyRes.error,
    ),
    toStatus(
      "cyberThreats",
      "Cyber threats",
      "AXE Intel cyber threat detection",
      cyberRes.ok && cyber.length > 0,
      cyberRes.ok ? undefined : cyberRes.error,
    ),
    toStatus(
      "militaryRadar",
      "Military radar",
      "AXE Intel global military aircraft tracking",
      militaryRes.ok && military.length > 0,
      militaryRes.ok ? undefined : militaryRes.error,
    ),
    toStatus(
      "emergencyMonitor",
      "Emergency monitor",
      "AXE Intel aviation emergency squawk tracking",
      // 0 emergencies is normal — only mark error if the call itself failed
      emergencyRes.ok,
      emergencyRes.ok ? undefined : emergencyRes.error,
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
    military,
    emergency,
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
