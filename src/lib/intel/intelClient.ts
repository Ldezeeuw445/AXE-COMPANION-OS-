import "server-only";
import { getSupabaseKey } from "@/lib/env";

const REVALIDATE_SECONDS = 15 * 60; // Unusual Whales is expensive and slow-moving enough for 15 min cache.
const SNAPSHOT_FRESH_MS = 15 * 60 * 1000;
const SNAPSHOT_STALE_MS = 24 * 60 * 60 * 1000;

export type IntelProviderState = "live" | "off" | "error";

export type IntelProviderStatus = {
  id:
    | "insiderTrades"
    | "senateTrades"
    | "darkPoolPrints"
    | "unusualOptions"
    | "marketTide";
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

export type IntelSnapshot = {
  generatedAt: string;
  insiders: InsiderTrade[];
  senate: SenateTrade[];
  darkPool: DarkPoolPrint[];
  options: UnusualOption[];
  tide: MarketTide | null;
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
  | "marketTide";

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
  const key = getSupabaseKey();
  if (!url || !key) return { ok: false, error: "missing_supabase_env" };
  try {
    const res = await fetch(`${url}/functions/v1/intel-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
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
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
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

  const insiders = insiderRes.ok && Array.isArray(insiderRes.data) ? insiderRes.data : [];
  const senate = senateRes.ok && Array.isArray(senateRes.data) ? senateRes.data : [];
  const darkPool = darkPoolRes.ok && Array.isArray(darkPoolRes.data) ? darkPoolRes.data : [];
  const options = optionsRes.ok && Array.isArray(optionsRes.data) ? optionsRes.data : [];
  const tide = tideRes.ok && tideRes.data ? tideRes.data : null;
  const hadError = [insiderRes, senateRes, darkPoolRes, optionsRes, tideRes].some((r) => !r.ok);
  const hasLiveData = Boolean(insiders.length || senate.length || darkPool.length || options.length || tide);

  if (hadError && cached && Date.now() - cached.savedAt < SNAPSHOT_STALE_MS) {
    return markCache(
      cached.snapshot,
      "stale",
      cached.savedAt,
      "Provider is cooling down or rate-limited. Showing the last cached intel snapshot.",
    );
  }

  const providers: IntelProviderStatus[] = [
    toStatus(
      "insiderTrades",
      "Insider trades",
      "Form 4 buys and sells via Unusual Whales",
      insiderRes.ok && insiders.length > 0,
      insiderRes.ok ? undefined : insiderRes.error,
    ),
    toStatus(
      "senateTrades",
      "Congress",
      "Senate + House disclosures via Unusual Whales",
      senateRes.ok && senate.length > 0,
      senateRes.ok ? undefined : senateRes.error,
    ),
    toStatus(
      "darkPoolPrints",
      "Dark pool",
      "Off-exchange prints via Unusual Whales",
      darkPoolRes.ok && darkPool.length > 0,
      darkPoolRes.ok ? undefined : darkPoolRes.error,
    ),
    toStatus(
      "unusualOptions",
      "Options flow",
      "Smart-money options alerts via Unusual Whales",
      optionsRes.ok && options.length > 0,
      optionsRes.ok ? undefined : optionsRes.error,
    ),
    toStatus(
      "marketTide",
      "Market tide",
      "Net call/put premium tide via Unusual Whales",
      tideRes.ok && tide != null,
      tideRes.ok ? undefined : tideRes.error,
    ),
  ];

  const snapshot: IntelSnapshot = {
    generatedAt: new Date().toISOString(),
    insiders,
    senate,
    darkPool,
    options,
    tide,
    providers,
    hasLiveData,
    cache: {
      state: hasLiveData ? "fresh" : "empty",
      ageSeconds: null,
      message: hasLiveData ? undefined : "No cached intel rows yet. The feed will retry without exposing provider errors.",
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
