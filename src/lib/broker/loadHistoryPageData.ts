import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { BrokerAccountRow } from "@/lib/broker/loadAccountsPageData";

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
  summary: HistorySummary | null;
  filters: { symbol: string; from: string; to: string };
  error: string | null;
};

const TRADE_LIMIT = 500;

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
      summary: null,
      filters: { symbol: symbolTrim, from: fromRaw, to: toRaw },
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
      summary: null,
      filters: { symbol: symbolTrim, from: fromRaw, to: toRaw },
      error: "Not signed in.",
    };
  }

  const [accsRes, prefsRes] = await Promise.all([
    supabase
      .from("user_broker_accounts")
      .select("id,label,provider,status,mt5_login,mt5_server,created_at")
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
      summary: null,
      filters: { symbol: symbolTrim, from: fromRaw, to: toRaw },
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
      summary: null,
      filters: { symbol: symbolTrim, from: fromRaw, to: toRaw },
      error: prefsErr ?? null,
    };
  }

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
      summary: null,
      filters: { symbol: symbolTrim, from: fromRaw, to: toRaw },
      error: tradeErr.message,
    };
  }

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
    summary: buildSummary(trades),
    filters: { symbol: symbolTrim, from: fromRaw, to: toRaw },
    error: prefsErr ?? null,
  };
}
