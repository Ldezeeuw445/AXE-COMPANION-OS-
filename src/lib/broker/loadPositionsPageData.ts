import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveMetaApiCloudAccount } from "@/lib/mt5/activeCloudAccount";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import { clientGetPositions, clientGetOrders } from "@/lib/mt5/metaApiClient";

export type OpenPositionRow = {
  id: string;
  symbol: string;
  side: string;
  volume: number;
  openPrice: number | null;
  currentPrice: number | null;
  profit: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  openTime: string | null;
};

export type PendingOrderRow = {
  id: string;
  symbol: string;
  type: string;        // "buy_limit" | "sell_limit" | "buy_stop" | "sell_stop" | ...
  volume: number;
  openPrice: number;   // trigger price
  currentPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  openTime: string | null;
};

export type PositionsPageData = {
  positions: OpenPositionRow[];
  pendingOrders: PendingOrderRow[];
  providerStatus: string | null;
  error: string | null;
  hint: string | null;
};

function mapSide(t: string | undefined): string {
  const u = (t ?? "").toUpperCase();
  if (u.includes("BUY")) return "buy";
  if (u.includes("SELL")) return "sell";
  return (t ?? "").toLowerCase();
}

function mapOrderType(t: string | undefined): string {
  const raw = (t ?? "").toLowerCase().replace(/_/g, " ");
  // MetaApi order types: ORDER_TYPE_BUY_LIMIT, ORDER_TYPE_SELL_LIMIT,
  // ORDER_TYPE_BUY_STOP, ORDER_TYPE_SELL_STOP, etc.
  if (raw.includes("buy") && raw.includes("limit")) return "buy_limit";
  if (raw.includes("sell") && raw.includes("limit")) return "sell_limit";
  if (raw.includes("buy") && raw.includes("stop")) return "buy_stop";
  if (raw.includes("sell") && raw.includes("stop")) return "sell_stop";
  return raw.trim() || "pending";
}

export async function loadPositionsPageData(): Promise<PositionsPageData> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { positions: [], pendingOrders: [], providerStatus: null, error: "Supabase is not configured.", hint: null };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { positions: [], pendingOrders: [], providerStatus: null, error: "Not signed in.", hint: null };
  }

  if (!getMetaApiToken()) {
    return {
      positions: [],
      pendingOrders: [],
      providerStatus: "provider_not_configured",
      error: null,
      hint: "AXE MT5 Cloud is not configured on the server yet, so live positions cannot load.",
    };
  }

  const cloud = await getActiveMetaApiCloudAccount(supabase, user.id);
  if (!cloud) {
    return {
      positions: [],
      pendingOrders: [],
      providerStatus: null,
      error: null,
      hint: "Set an active AXE MT5 Cloud account on Accounts, then Sync. Positions load from your MT5 terminal through AXE.",
    };
  }

  try {
    // Fetch positions and pending orders in parallel
    const [rawPositions, rawOrders] = await Promise.all([
      clientGetPositions(cloud.metaApiAccountId, true, cloud.metaApiRegion) as Promise<Record<string, unknown>[]>,
      clientGetOrders(cloud.metaApiAccountId, false, cloud.metaApiRegion).catch(() => [] as Record<string, unknown>[]) as Promise<Record<string, unknown>[]>,
    ]);

    const positions: OpenPositionRow[] = rawPositions.map((p, i) => {
      const id = String(p.id ?? p.positionId ?? i);
      const symbol = String(p.symbol ?? "");
      const side = mapSide(typeof p.type === "string" ? (p.type as string) : undefined);
      return {
        id,
        symbol,
        side,
        volume: Number(p.volume ?? 0) || 0,
        openPrice: p.openPrice != null ? Number(p.openPrice) : null,
        currentPrice: p.currentPrice != null ? Number(p.currentPrice) : p.price != null ? Number(p.price) : null,
        profit: p.profit != null ? Number(p.profit) : p.unrealizedProfit != null ? Number(p.unrealizedProfit) : null,
        stopLoss: p.stopLoss != null ? Number(p.stopLoss) : null,
        takeProfit: p.takeProfit != null ? Number(p.takeProfit) : null,
        openTime: (p.time as string) ?? (p.updateTime as string) ?? null,
      };
    });

    const pendingOrders: PendingOrderRow[] = rawOrders.map((o, i) => {
      const id = String(o.id ?? o.orderId ?? i);
      const symbol = String(o.symbol ?? "");
      const type = mapOrderType(typeof o.type === "string" ? (o.type as string) : undefined);
      return {
        id,
        symbol,
        type,
        volume: Number(o.volume ?? 0) || 0,
        openPrice: Number(o.openPrice ?? o.price ?? 0),
        currentPrice: o.currentPrice != null ? Number(o.currentPrice) : null,
        stopLoss: o.stopLoss != null ? Number(o.stopLoss) : null,
        takeProfit: o.takeProfit != null ? Number(o.takeProfit) : null,
        openTime: (o.time as string) ?? (o.doneTime as string) ?? null,
      };
    });

    const isEmpty = positions.length === 0 && pendingOrders.length === 0;
    return {
      positions,
      pendingOrders,
      providerStatus: "connected",
      error: null,
      hint: isEmpty ? "No open positions or pending orders on this account right now." : null,
    };
  } catch {
    return {
      positions: [],
      pendingOrders: [],
      providerStatus: "failed",
      error: null,
      hint: "Could not load positions through AXE MT5 Cloud. Try Test/Sync on Accounts, or check server logs.",
    };
  }
}
