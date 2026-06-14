import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { BrokerAccountRow } from "@/lib/broker/loadAccountsPageData";
import { getMetaApiCloudAccountById } from "@/lib/mt5/activeCloudAccount";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import {
  clientGetHistoryDealsRange,
  clientGetHistoryOrdersRange,
} from "@/lib/mt5/metaApiClient";
import { syncAccountIfStale } from "@/lib/mt5/backgroundSync";

export type HistorySearchParams = {
  account?: string;
  symbol?: string;
  from?: string;
  to?: string;
};

export type BrokerTradeRow = {
  id: string;
  accountId: string;
  symbol: string;
  side: string;
  volume: number;
  openTime: string | null;
  closeTime: string | null;
  openPrice: number | null;
  closePrice: number | null;
  pnl: number;
  fees: number;
};

export type HistoryOrderRow = {
  id: string;
  symbol: string;
  type: string;
  state: string;
  volume: number;
  openPrice: number | null;
  doneTime: string | null;
};

export type HistoryDealRow = {
  id: string;
  symbol: string;
  type: string;
  entryType: string;
  volume: number;
  price: number | null;
  profit: number;
  fees: number;
  time: string | null;
};

export type HistorySummary = {
  totalTrades: number;
  totalPnl: number;
  winRate: number;
  avgWin: number | null;
  avgLoss: number | null;
  wins: number;
  losses: number;
};

export type HistoryPageData = {
  accounts: BrokerAccountRow[];
  activeAccountId: string | null;
  selectedAccountId: string | null;
  trades: BrokerTradeRow[];
  orders: HistoryOrderRow[];
  deals: HistoryDealRow[];
  summary: HistorySummary | null;
  filters: { symbol: string; from: string; to: string };
  historyHint: string | null;
  error: string | null;
};

const TRADE_LIMIT = 500;
const HISTORY_DAYS = 90;

function mapOrderType(t: string | undefined): string {
  const raw = (t ?? "").toLowerCase().replace(/^order_type_/, "").replace(/_/g, " ");
  if (raw.includes("buy") && raw.includes("limit")) return "buy limit";
  if (raw.includes("sell") && raw.includes("limit")) return "sell limit";
  if (raw.includes("buy") && raw.includes("stop")) return "buy stop";
  if (raw.includes("sell") && raw.includes("stop")) return "sell stop";
  if (raw === "buy") return "buy";
  if (raw === "sell") return "sell";
  return raw.trim() || "order";
}

function mapOrderState(s: string | undefined): string {
  const raw = (s ?? "").toLowerCase().replace(/^order_state_/, "").replace(/_/g, " ");
  return raw.trim() || "unknown";
}

function mapDealType(t: string | undefined): string {
  return (t ?? "").toLowerCase().replace(/^deal_type_/, "").replace(/_/g, " ") || "deal";
}

function mapDealEntry(e: string | undefined): string {
  return (e ?? "").toLowerCase().replace(/^deal_entry_/, "").replace(/_/g, " ") || "";
}

function normalizeHistoryOrders(raw: unknown[]): HistoryOrderRow[] {
  return raw
    .map((item) => {
      const r = item as Record<string, unknown>;
      const id = r.id != null ? String(r.id) : "";
      const symbol = String(r.symbol ?? "");
      if (!id || !symbol) return null;
      return {
        id,
        symbol,
        type: mapOrderType(String(r.type ?? "")),
        state: mapOrderState(String(r.state ?? "")),
        volume: Number(r.volume ?? 0) || 0,
        openPrice: r.openPrice != null ? Number(r.openPrice) : null,
        doneTime: (r.doneTime as string | null) ?? (r.time as string | null) ?? null,
      };
    })
    .filter((x): x is HistoryOrderRow => x != null)
    .sort((a, b) => String(b.doneTime ?? "").localeCompare(String(a.doneTime ?? "")));
}

function normalizeHistoryDeals(raw: unknown[]): HistoryDealRow[] {
  return raw
    .map((item) => {
      const r = item as Record<string, unknown>;
      const id = r.id != null ? String(r.id) : "";
      const symbol = String(r.symbol ?? "");
      if (!id || !symbol) return null;
      const commission = Number(r.commission ?? 0) || 0;
      const swap = Number(r.swap ?? 0) || 0;
      return {
        id,
        symbol,
        type: mapDealType(String(r.type ?? "")),
        entryType: mapDealEntry(String(r.entryType ?? "")),
        volume: Number(r.volume ?? 0) || 0,
        price: r.price != null ? Number(r.price) : null,
        profit: Number(r.profit ?? 0) || 0,
        fees: commission + swap,
        time: (r.time as string | null) ?? null,
      };
    })
    .filter((x): x is HistoryDealRow => x != null)
    .sort((a, b) => String(b.time ?? "").localeCompare(String(a.time ?? "")));
}

function filterBySymbol<T extends { symbol: string }>(rows: T[], symbol: string): T[] {
  if (!symbol) return rows;
  const u = symbol.toUpperCase();
  return rows.filter((r) => r.symbol.toUpperCase() === u);
}

function filterByTimeRange<T>(rows: T[], fromIso: string | null, toIso: string | null, pick: (r: T) => string | null): T[] {
  return rows.filter((r) => {
    const t = pick(r);
    if (!t) return true;
    if (fromIso && t < fromIso) return false;
    if (toIso && t > toIso) return false;
    return true;
  });
}

async function loadCloudHistoryOrdersDeals(
  userId: string,
  selectedAccountId: string,
  symbolTrim: string,
  fromIso: string | null,
  toIso: string | null,
): Promise<{ orders: HistoryOrderRow[]; deals: HistoryDealRow[]; hint: string | null }> {
  if (!getMetaApiToken()) {
    return { orders: [], deals: [], hint: "MetaApi is not configured — order/deal history unavailable." };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { orders: [], deals: [], hint: null };

  const cloud = await getMetaApiCloudAccountById(supabase, userId, selectedAccountId);
  if (!cloud) {
    return {
      orders: [],
      deals: [],
      hint: "Order and deal history requires a MetaApi cloud MT5 account.",
    };
  }

  const end = toIso ? new Date(toIso) : new Date();
  const start = fromIso
    ? new Date(fromIso)
    : new Date(end.getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000);

  try {
    const [ordersRaw, dealsRaw] = await Promise.all([
      clientGetHistoryOrdersRange(cloud.metaApiAccountId, start.toISOString(), end.toISOString(), cloud.metaApiRegion),
      clientGetHistoryDealsRange(cloud.metaApiAccountId, start.toISOString(), end.toISOString(), cloud.metaApiRegion),
    ]);

    let orders = normalizeHistoryOrders(ordersRaw);
    let deals = normalizeHistoryDeals(dealsRaw);
    orders = filterBySymbol(orders, symbolTrim);
    deals = filterBySymbol(deals, symbolTrim);
    orders = filterByTimeRange(orders, fromIso, toIso, (r) => r.doneTime);
    deals = filterByTimeRange(deals, fromIso, toIso, (r) => r.time);

    return { orders: orders.slice(0, TRADE_LIMIT), deals: deals.slice(0, TRADE_LIMIT), hint: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load broker history.";
    return { orders: [], deals: [], hint: msg };
  }
}

function accountIdSet(accounts: BrokerAccountRow[]): Set<string> {
  return new Set(accounts.map((a) => a.id));
}

function resolveSelectedAccountId(
  accounts: BrokerAccountRow[],
  activeAccountId: string | null,
  requested: string | undefined,
): string | null {
  const ids = accountIdSet(accounts);
  if (requested && ids.has(requested)) return requested;
  if (activeAccountId && ids.has(activeAccountId)) return activeAccountId;
  return null;
}

function dayStartUtc(isoDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  return `${isoDate}T00:00:00.000Z`;
}

function dayEndUtc(isoDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  return `${isoDate}T23:59:59.999Z`;
}

function buildSummary(trades: BrokerTradeRow[]): HistorySummary {
  const totalTrades = trades.length;
  let totalPnl = 0;
  const winPnls: number[] = [];
  const lossPnls: number[] = [];
  for (const t of trades) {
    totalPnl += t.pnl;
    if (t.pnl > 0) winPnls.push(t.pnl);
    else if (t.pnl < 0) lossPnls.push(t.pnl);
  }
  const wins = winPnls.length;
  const losses = lossPnls.length;
  const decided = wins + losses;
  const winRate = decided > 0 ? wins / decided : 0;
  const avgWin =
    winPnls.length > 0
      ? winPnls.reduce((a, b) => a + b, 0) / winPnls.length
      : null;
  const avgLoss =
    lossPnls.length > 0
      ? lossPnls.reduce((a, b) => a + b, 0) / lossPnls.length
      : null;
  return {
    totalTrades,
    totalPnl,
    winRate,
    avgWin,
    avgLoss,
    wins,
    losses,
  };
}

/** Server-only loader for /history — RLS via authenticated Supabase client. */
export async function loadHistoryPageData(
  search: HistorySearchParams,
): Promise<HistoryPageData> {
  const symbolTrim = (search.symbol ?? "").trim();
  const fromRaw = (search.from ?? "").trim();
  const toRaw = (search.to ?? "").trim();

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      accounts: [],
      activeAccountId: null,
      selectedAccountId: null,
      trades: [],
      orders: [],
      deals: [],
      summary: null,
      filters: { symbol: symbolTrim, from: fromRaw, to: toRaw },
      historyHint: null,
      error: "Supabase is not configured.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      accounts: [],
      activeAccountId: null,
      selectedAccountId: null,
      trades: [],
      orders: [],
      deals: [],
      summary: null,
      filters: { symbol: symbolTrim, from: fromRaw, to: toRaw },
      historyHint: null,
      error: "Not signed in.",
    };
  }

  const [accsRes, prefsRes] = await Promise.all([
    supabase
      .from("user_broker_accounts")
      .select(
        "id,label,provider,status,mt5_login,mt5_server,created_at,connection_method,external_connection_id,provider_status,last_sync_at,masked_login,metadata",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("user_workspace_preferences")
      .select("active_account_id")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (accsRes.error) {
    return {
      accounts: [],
      activeAccountId: null,
      selectedAccountId: null,
      trades: [],
      orders: [],
      deals: [],
      summary: null,
      filters: { symbol: symbolTrim, from: fromRaw, to: toRaw },
      historyHint: null,
      error: accsRes.error.message,
    };
  }

  const accounts = (accsRes.data ?? []) as BrokerAccountRow[];
  const activeAccountId = prefsRes.data?.active_account_id ?? null;
  const prefsErr = prefsRes.error?.message;

  const selectedAccountId = resolveSelectedAccountId(
    accounts,
    activeAccountId,
    search.account,
  );

  if (!selectedAccountId) {
    return {
      accounts,
      activeAccountId,
      selectedAccountId: null,
      trades: [],
      orders: [],
      deals: [],
      summary: null,
      filters: { symbol: symbolTrim, from: fromRaw, to: toRaw },
      historyHint: null,
      error: prefsErr ?? null,
    };
  }

  void syncAccountIfStale(supabase, user.id, selectedAccountId).catch(() => undefined);

  let q = supabase
    .from("broker_trades")
    .select(
      "id,account_id,symbol,side,volume,open_time,close_time,open_price,close_price,pnl,fees",
    )
    .eq("user_id", user.id)
    .eq("account_id", selectedAccountId)
    .order("close_time", { ascending: false, nullsFirst: false })
    .limit(TRADE_LIMIT);

  if (symbolTrim) q = q.eq("symbol", symbolTrim);

  const fromIso = fromRaw ? dayStartUtc(fromRaw) : null;
  const toIso = toRaw ? dayEndUtc(toRaw) : null;
  if (fromIso) q = q.gte("close_time", fromIso);
  if (toIso) q = q.lte("close_time", toIso);

  const { data: tradeRows, error: tradeErr } = await q;

  if (tradeErr) {
    return {
      accounts,
      activeAccountId,
      selectedAccountId,
      trades: [],
      orders: [],
      deals: [],
      summary: null,
      filters: { symbol: symbolTrim, from: fromRaw, to: toRaw },
      historyHint: null,
      error: tradeErr.message,
    };
  }

  const cloudHistory = await loadCloudHistoryOrdersDeals(
    user.id,
    selectedAccountId,
    symbolTrim,
    fromIso,
    toIso,
  );

  const trades: BrokerTradeRow[] = (tradeRows ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    accountId: String(r.account_id),
    symbol: String(r.symbol ?? ""),
    side: String(r.side ?? ""),
    volume: Number(r.volume ?? 0) || 0,
    openTime: (r.open_time as string | null) ?? null,
    closeTime: (r.close_time as string | null) ?? null,
    openPrice: r.open_price != null ? Number(r.open_price) : null,
    closePrice: r.close_price != null ? Number(r.close_price) : null,
    pnl: Number(r.pnl ?? 0) || 0,
    fees: Number(r.fees ?? 0) || 0,
  }));

  return {
    accounts,
    activeAccountId,
    selectedAccountId,
    trades,
    orders: cloudHistory.orders,
    deals: cloudHistory.deals,
    summary: buildSummary(trades),
    filters: { symbol: symbolTrim, from: fromRaw, to: toRaw },
    historyHint: cloudHistory.hint,
    error: prefsErr ?? null,
  };
}
