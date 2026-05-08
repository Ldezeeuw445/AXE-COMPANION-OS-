import "server-only";
import { getSupabaseKey } from "@/lib/env";

const REVALIDATE_SECONDS = 60; // Intel feeds are slow-moving; 60s is plenty.

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
};

type IntelAction =
  | "insiderTrades"
  | "senateTrades"
  | "darkPoolPrints"
  | "unusualOptions"
  | "marketTide";

type IntelEnvelope<T> = { ok: true; data: T } | { ok: false; error: string };

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
      // Edge function is rate-limited and the data is slow-moving — tag so the
      // companion can opportunistically reuse one fetch across renders.
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
  return {
    id,
    label,
    state: err ? "error" : "off",
    description: err ? `${description} — ${err}` : `${description} — no data yet`,
  };
}

export async function loadIntelSnapshot(opts?: {
  symbol?: string;
}): Promise<IntelSnapshot> {
  const args: Record<string, unknown> = opts?.symbol
    ? { symbol: opts.symbol.toUpperCase() }
    : {};

  const [insiderRes, senateRes, darkPoolRes, optionsRes, tideRes] = await Promise.all([
    callIntelProxy<InsiderTrade[]>("insiderTrades", args),
    callIntelProxy<SenateTrade[]>("senateTrades", {}),
    callIntelProxy<DarkPoolPrint[]>("darkPoolPrints", args),
    callIntelProxy<UnusualOption[]>("unusualOptions", args),
    callIntelProxy<MarketTide | null>("marketTide", {}),
  ]);

  const insiders = insiderRes.ok && Array.isArray(insiderRes.data) ? insiderRes.data : [];
  const senate = senateRes.ok && Array.isArray(senateRes.data) ? senateRes.data : [];
  const darkPool = darkPoolRes.ok && Array.isArray(darkPoolRes.data) ? darkPoolRes.data : [];
  const options = optionsRes.ok && Array.isArray(optionsRes.data) ? optionsRes.data : [];
  const tide = tideRes.ok && tideRes.data ? tideRes.data : null;

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

  const hasLiveData = providers.some((p) => p.state === "live");

  return {
    generatedAt: new Date().toISOString(),
    insiders,
    senate,
    darkPool,
    options,
    tide,
    providers,
    hasLiveData,
  };
}
