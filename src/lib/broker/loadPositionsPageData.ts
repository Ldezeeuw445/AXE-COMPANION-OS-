import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveMetaApiCloudAccount } from "@/lib/mt5/activeCloudAccount";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import { clientGetPositions, clientGetOrders, clientGetAccountInformation } from "@/lib/mt5/metaApiClient";
import { asFiniteNumber } from "@/lib/journal/tradePnl";

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

export type AccountSummary = {
  balance: number | null;
  equity: number | null;
  margin: number | null;
  freeMargin: number | null;
  marginLevel: number | null;
  currency: string | null;
};

export type PositionsPageData = {
  positions: OpenPositionRow[];
  pendingOrders: PendingOrderRow[];
  accountSummary: AccountSummary | null;
  /** ISO last sync for the figures bar. Null when the account never synced. */
  lastSyncAt: string | null;
  /** True when balance/equity came from the last stored snapshot, not a live fetch. */
  figuresFromCache: boolean;
  providerStatus: string | null;
  error: string | null;
  hint: string | null;
  /** Supabase user_broker_accounts.id — needed by client for close/modify calls. */
  brokerAccountId: string | null;
};

function emptyPositions(partial: Partial<PositionsPageData> = {}): PositionsPageData {
  return {
    positions: [],
    pendingOrders: [],
    accountSummary: null,
    lastSyncAt: null,
    figuresFromCache: false,
    providerStatus: null,
    error: null,
    hint: null,
    brokerAccountId: null,
    ...partial,
  };
}

function accountSummaryFromMetadata(metadata: Record<string, unknown>): AccountSummary | null {
  const raw = metadata.accountSummary;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const summary = raw as Record<string, unknown>;
  const num = (value: unknown): number | null => {
    if (value == null) return null;
    const n = asFiniteNumber(value, Number.NaN);
    return Number.isFinite(n) ? n : null;
  };
  const mapped: AccountSummary = {
    balance: num(summary.balance),
    equity: num(summary.equity),
    margin: num(summary.margin),
    freeMargin: num(summary.freeMargin),
    marginLevel: num(summary.marginLevel),
    currency: typeof summary.currency === "string" ? summary.currency.trim().toUpperCase() : null,
  };
  if (mapped.balance == null && mapped.equity == null) return null;
  return mapped;
}

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
    return emptyPositions({ error: "Supabase is not configured." });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return emptyPositions({ error: "Not signed in." });
  }

  if (!getMetaApiToken()) {
    return emptyPositions({
      providerStatus: "provider_not_configured",
      hint: "AXE MT5 Cloud is not configured on the server yet, so live positions cannot load.",
    });
  }

  const cloud = await getActiveMetaApiCloudAccount(supabase, user.id);
  if (!cloud) {
    return emptyPositions({
      hint: "Set an active AXE MT5 Cloud account on Accounts, then Sync. Positions load from your MT5 terminal through AXE.",
    });
  }

  const cachedSummary = accountSummaryFromMetadata(cloud.metadata);

  try {
    // Fetch account info, positions, and pending orders in parallel
    const [rawAccountInfo, rawPositions, rawOrders] = await Promise.all([
      clientGetAccountInformation(cloud.metaApiAccountId, false, cloud.metaApiRegion).catch(() => ({}) as Record<string, unknown>),
      clientGetPositions(cloud.metaApiAccountId, true, cloud.metaApiRegion) as Promise<Record<string, unknown>[]>,
      clientGetOrders(cloud.metaApiAccountId, false, cloud.metaApiRegion).catch(() => [] as Record<string, unknown>[]) as Promise<Record<string, unknown>[]>,
    ]);

    const liveSummary: AccountSummary = {
      balance: rawAccountInfo.balance != null ? Number(rawAccountInfo.balance) : null,
      equity: rawAccountInfo.equity != null ? Number(rawAccountInfo.equity) : null,
      margin: rawAccountInfo.margin != null ? Number(rawAccountInfo.margin) : null,
      freeMargin: rawAccountInfo.freeMargin != null ? Number(rawAccountInfo.freeMargin) : null,
      marginLevel: rawAccountInfo.marginLevel != null ? Number(rawAccountInfo.marginLevel) : null,
      currency: typeof rawAccountInfo.currency === "string" ? rawAccountInfo.currency : null,
    };
    const liveHasFigures = liveSummary.balance != null || liveSummary.equity != null;
    const accountSummary = liveHasFigures ? liveSummary : cachedSummary;
    const figuresFromCache = !liveHasFigures && cachedSummary != null;

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
      accountSummary,
      lastSyncAt: liveHasFigures ? new Date().toISOString() : cloud.lastSyncAt,
      figuresFromCache,
      providerStatus: "connected",
      error: null,
      hint: isEmpty ? "No open positions or pending orders on this account right now." : null,
      brokerAccountId: cloud.brokerAccountId,
    };
  } catch {
    return emptyPositions({
      accountSummary: cachedSummary,
      lastSyncAt: cloud.lastSyncAt,
      figuresFromCache: cachedSummary != null,
      providerStatus: "failed",
      hint: "Could not load positions through AXE MT5 Cloud. Try Test/Sync on Accounts, or check server logs.",
      brokerAccountId: cloud.brokerAccountId,
    });
  }
}
