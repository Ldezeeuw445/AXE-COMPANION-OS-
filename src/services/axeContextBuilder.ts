import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AccountsContext,
  AlertsContext,
  AxeCompanionContext,
  AxeMemoryEntry,
  ChartPositionContext,
  ChartContext,
  CompanionBrokerAccount,
  CompanionBrokerTrade,
  CompanionJournalEntry,
  CompanionTradeLabel,
  CorrelationInsight,
  ContextHealth,
  FilteredNewsEvent,
  IntelContext,
  IntelSummary,
  MarketContextSummary,
  MemoryContext,
  Mt5AccountSnapshot,
  Mt5ClosedPosition,
  Mt5Position,
  OpenCommitment,
  SettingsUserContext,
  TradesJournalContext,
  TradingOSContext,
} from "@/types/context";
import type { TerminalAlert, TerminalExecution, WatchlistEntry } from "@/services/axeService";
import { loadIntelSnapshot } from "@/lib/intel/intelClient";
import { buildMarketContext, summarizeMarketContext } from "@/lib/market/marketContextService";
import { brokerPricingState } from "@/lib/runtime/runtimeTruth";
import { getMetadataSymbolMap, getMetadataSymbolReport } from "@/lib/broker/brokerSymbolRuntime";

const ADAPTER_TIMEOUT_MS = 7_000;
const INTEL_TIMEOUT_MS = 14_000;
const MARKET_TIMEOUT_MS = 12_000;

const EMPTY_SETTINGS: SettingsUserContext = {
  profile: { displayName: null, timezone: null },
  pinnedContext: null,
  accountName: null,
  watchlist: [],
  push: { subscribed: false, subscriptionCount: 0 },
  liveTradingEnabled: false,
};

const EMPTY_ACCOUNTS: AccountsContext = {
  activeAccountId: null,
  accounts: [],
  hasCloudMt5: false,
  activeLabel: null,
  activeServer: null,
  accountHealth: "unknown",
  syncFreshness: { lastSyncAt: null, ageMinutes: null, state: "missing" },
  activeSymbols: [],
  activeSymbolMap: {},
  activeSymbolResolutionReport: {},
  openExposure: { positionsCount: 0, symbols: [], netBySymbol: [] },
};

const EMPTY_CHART: ChartContext = {
  symbol: null,
  timeframe: null,
  brokerSymbol: null,
  accountId: null,
  lastPrice: null,
  lastBid: null,
  lastAsk: null,
  lastTickAt: null,
  lastCandleAt: null,
  liveStatus: null,
  source: null,
  updatedAt: null,
  openPositionsCount: null,
  staleState: "unknown",
  relatedOpenPositions: [],
  recentState: null,
};

const EMPTY_TRADES: TradesJournalContext = {
  activeAccountId: null,
  recentTrades: [],
  labels: [],
  journalEntries: [],
  analytics: { totalTrades: 0, totalPnl: 0, wins: 0, losses: 0 },
  labelCounts: [],
  recurringLabels: [],
  riskPatterns: [],
  recentWins: [],
  recentMistakes: [],
};

const EMPTY_INTEL: IntelContext = {
  symbol: null,
  summary: null,
  providers: [],
  compactSummary: null,
  providerHealth: [],
  cache: { state: "empty", ageSeconds: null },
  hasLiveData: false,
};

const EMPTY_ALERTS: AlertsContext = {
  active: 0,
  paused: 0,
  triggered: 0,
  recent: [],
  symbolAlerts: [],
};

const EMPTY_MARKET: MarketContextSummary = {
  symbol: null,
  summary: null,
  providers: [],
  hasLiveData: false,
  raw: null,
};

const EMPTY_MEMORY: MemoryContext = {
  entries: [],
  prioritizedEntries: [],
  openCommitments: [],
  compactSummary: null,
};

type BuilderArgs = {
  userId: string;
  supabase: SupabaseClient;
  symbol?: string | null;
  tf?: string | null;
  pinnedContext?: string | null;
};

type AdapterResult<T> = {
  value: T;
  health: ContextHealth;
};

type LegacyContextParts = {
  filteredNews: FilteredNewsEvent[];
  recentExecutions: TerminalExecution[];
  liveAccount: Mt5AccountSnapshot | null;
  livePositions: Mt5Position[];
  closedPositions: Mt5ClosedPosition[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function minutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round(ms / 60_000));
}

function syncState(ageMinutes: number | null): AccountsContext["syncFreshness"]["state"] {
  if (ageMinutes == null) return "missing";
  if (ageMinutes <= 15) return "fresh";
  if (ageMinutes <= 120) return "stale";
  return "old";
}

function normalizeDoctorContext(meta: unknown): AccountsContext["accounts"][number]["mt5Doctor"] {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const raw = (meta as Record<string, unknown>).lastDoctor;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  const steps = Array.isArray(d.steps) ? (d.steps as Array<Record<string, unknown>>) : [];
  const stepStatus = (id: string): boolean | null => {
    const found = steps.find((step) => step.id === id);
    if (!found) return null;
    if (found.status === "pass") return true;
    if (found.status === "fail") return false;
    return null;
  };
  const overallStatus = String(d.overallStatus ?? "");
  if (!overallStatus || !d.checkedAt || !d.headline) return null;
  return {
    checkedAt: String(d.checkedAt),
    overallStatus: overallStatus as NonNullable<AccountsContext["accounts"][number]["mt5Doctor"]>["overallStatus"],
    headline: String(d.headline),
    summary: String(d.summary ?? d.headline),
    positionsReadable: stepStatus("positions_readable"),
    historyReadable: stepStatus("history_readable"),
    livePricesAvailable: stepStatus("live_prices_available"),
    tradingState: d.liveTradingEnabled ? "live_trading_enabled" : "read_only",
    knownFailureReason: d.knownFailureReason != null ? String(d.knownFailureReason) : null,
  };
}

function staleState(updatedAt: string | null, status: string | null): ChartContext["staleState"] {
  const s = (status ?? "").toLowerCase();
  if (s === "offline") return "offline";
  if (s === "stale") return "stale";
  const age = minutesSince(updatedAt);
  if (age == null) return "unknown";
  if (age <= 2) return "live";
  if (age <= 15) return "stale";
  return "offline";
}

function compactList(items: string[], max = 6): string[] {
  return Array.from(new Set(items.filter(Boolean))).slice(0, max);
}

function sectionHealth(
  section: ContextHealth["section"],
  state: ContextHealth["state"],
  message?: string,
  updatedAt?: string | null,
): ContextHealth {
  return { section, state, message, updatedAt };
}

async function withAdapter<T>(
  section: ContextHealth["section"],
  fallback: T,
  task: () => Promise<T>,
  timeoutMs = ADAPTER_TIMEOUT_MS,
): Promise<AdapterResult<T>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const value = await Promise.race([
      task(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("adapter_timeout")), timeoutMs);
      }),
    ]);
    return { value, health: sectionHealth(section, "ready") };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      value: fallback,
      health: sectionHealth(section, message === "adapter_timeout" ? "timeout" : "error", message),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeSymbol(symbol?: string | null): string | null {
  const s = (symbol ?? "").trim().toUpperCase();
  return s || null;
}

function normalizePosition(row: Record<string, unknown>, fallbackSymbol: string | null): ChartPositionContext {
  const symbol = String(row.symbol ?? fallbackSymbol ?? "").toUpperCase();
  const sideRaw = String(row.side ?? row.type ?? "").toLowerCase();
  const side = sideRaw.includes("sell") ? "sell" : sideRaw.includes("buy") ? "buy" : sideRaw || "unknown";
  return {
    id: String(row.id ?? row.positionId ?? `${symbol}-${side}`),
    symbol,
    side,
    volume: Number(row.volume ?? 0) || 0,
    entryPrice: row.entryPrice != null ? Number(row.entryPrice) : row.openPrice != null ? Number(row.openPrice) : null,
    currentPrice: row.currentPrice != null ? Number(row.currentPrice) : row.price != null ? Number(row.price) : null,
    profit: row.profit != null ? Number(row.profit) : row.unrealizedProfit != null ? Number(row.unrealizedProfit) : null,
    stopLoss: row.stopLoss != null ? Number(row.stopLoss) : null,
    takeProfit: row.takeProfit != null ? Number(row.takeProfit) : null,
  };
}

function summarizeOpenExposure(positions: ChartPositionContext[]): AccountsContext["openExposure"] {
  const bySymbol = new Map<string, number>();
  for (const p of positions) {
    const signed = p.side === "sell" ? -p.volume : p.side === "buy" ? p.volume : 0;
    bySymbol.set(p.symbol, (bySymbol.get(p.symbol) ?? 0) + signed);
  }
  return {
    positionsCount: positions.length,
    symbols: Array.from(bySymbol.keys()).sort(),
    netBySymbol: Array.from(bySymbol.entries()).map(([symbol, netVolume]) => ({
      symbol,
      netVolume,
      direction: netVolume > 0 ? "long" : netVolume < 0 ? "short" : "flat",
    })),
  };
}

function mapManualWatchlist(rows: Array<Record<string, unknown>>): WatchlistEntry[] {
  const mapped: WatchlistEntry[] = [];
  for (const r of rows) {
    const symbol = String(r.entry_key ?? "").trim().toUpperCase();
    if (!symbol) continue;
    const content = String(r.content ?? "");
    mapped.push({
      symbol,
      kind: "manual",
      condition_type: null,
      condition_payload: null,
      message: content && content !== symbol ? content : null,
    });
  }
  return mapped;
}

function mapUserAlert(row: Record<string, unknown>): TerminalAlert {
  const symbol = row.symbol ? String(row.symbol).toUpperCase() : null;
  const type = row.type ? String(row.type) : "alert";
  const condition = row.condition ? String(row.condition) : null;
  const threshold = row.threshold != null ? String(row.threshold) : null;
  const keyword = row.keyword ? String(row.keyword) : null;
  const status = row.status ? String(row.status) : "active";
  const title = [symbol, type].filter(Boolean).join(" ") || "Alert";
  const detail = [condition, threshold, keyword].filter(Boolean).join(" ");
  return {
    title,
    body: detail || null,
    type,
    read: status !== "active",
  };
}

function mapIntelSummary(intel: Awaited<ReturnType<typeof loadIntelSnapshot>>): IntelSummary | null {
  if (!intel.hasLiveData) return null;
  return {
    generatedAt: intel.generatedAt,
    tideBias: intel.tide?.bias ?? null,
    netCallPremium: intel.tide?.netCallPremium ?? null,
    netPutPremium: intel.tide?.netPutPremium ?? null,
    topInsiders: intel.insiders.slice(0, 3).map((r) => ({
      ticker: r.ticker,
      insider: r.insider,
      type: r.type,
      value: r.value,
      date: r.date,
    })),
    topCongress: intel.senate.slice(0, 3).map((r) => ({
      politician: r.politician,
      chamber: r.chamber,
      ticker: r.ticker,
      direction: r.direction,
      size: r.size,
      date: r.date,
    })),
    topDarkPool: intel.darkPool.slice(0, 3).map((r) => ({
      symbol: r.symbol,
      notional: r.notional,
      size: r.size,
      price: r.price,
    })),
    topOptions: intel.options.slice(0, 3).map((r) => ({
      symbol: r.symbol,
      side: r.side,
      strike: r.strike,
      exp: r.exp,
      premium: r.premium,
    })),
  };
}

async function buildSettings(
  supabase: SupabaseClient,
  userId: string,
  pinnedContext?: string | null,
): Promise<SettingsUserContext> {
  const [profileRes, memoryRes, prefsRes, pushRes, conversationRes] = await Promise.all([
    supabase.from("profiles").select("display_name,timezone").eq("id", userId).maybeSingle(),
    supabase
      .from("assistant_memory_entries")
      .select("id,scope,entry_key,content,created_at")
      .eq("user_id", userId)
      .in("scope", ["watchlist", "account"])
      .order("created_at", { ascending: true }),
    supabase
      .from("user_workspace_preferences")
      .select("active_account_id,live_trading_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    pinnedContext == null
      ? supabase
          .from("conversations")
          .select("pinned_context,messages(count)")
          .eq("user_id", userId)
          .order("last_message_at", { ascending: false })
      : Promise.resolve({ data: null, error: null }),
  ]);

  const memoryRows = (memoryRes.data ?? []) as Array<Record<string, unknown>>;
  const accountName =
    memoryRows.find((r) => r.scope === "account" && r.entry_key === "name")?.content ?? null;
  const watchlist = mapManualWatchlist(memoryRows.filter((r) => r.scope === "watchlist"));
  const conversations = Array.isArray(conversationRes.data) ? conversationRes.data : [];
  const fallbackPinned = conversations[0]?.pinned_context as string | null | undefined;

  return {
    profile: {
      displayName: (profileRes.data?.display_name as string | null | undefined) ?? null,
      timezone: (profileRes.data?.timezone as string | null | undefined) ?? null,
    },
    pinnedContext: pinnedContext ?? fallbackPinned ?? null,
    accountName: accountName != null ? String(accountName) : null,
    watchlist,
    push: {
      subscribed: (pushRes.count ?? 0) > 0,
      subscriptionCount: pushRes.count ?? 0,
    },
    liveTradingEnabled: Boolean(prefsRes.data?.live_trading_enabled),
  };
}

async function buildAccounts(supabase: SupabaseClient, userId: string): Promise<AccountsContext> {
  const [accountsRes, prefsRes] = await Promise.all([
    supabase
      .from("user_broker_accounts")
      .select("id,label,provider,status,mt5_login,mt5_server,connection_method,provider_status,last_sync_at,masked_login,metadata,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("user_workspace_preferences")
      .select("active_account_id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const activeAccountId = (prefsRes.data?.active_account_id as string | null | undefined) ?? null;
  const accounts = ((accountsRes.data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const metadata = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id),
      label: String(r.label ?? "MT5 Account"),
      provider: String(r.provider ?? "mt5"),
      status: r.status != null ? String(r.status) : null,
      connectionMethod: r.connection_method != null ? String(r.connection_method) : null,
      providerStatus: r.provider_status != null ? String(r.provider_status) : null,
      lastSyncAt: (r.last_sync_at as string | null | undefined) ?? null,
      maskedLogin:
        (r.masked_login as string | null | undefined) ??
        (r.mt5_login != null ? String(r.mt5_login) : null),
      mt5Server: (r.mt5_server as string | null | undefined) ?? null,
      active: activeAccountId === r.id,
      mt5Doctor: normalizeDoctorContext(r.metadata),
      symbolMap: getMetadataSymbolMap(metadata),
      symbolResolutionReport: getMetadataSymbolReport(metadata),
    };
  });
  const active = accounts.find((a) => a.active) ?? accounts[0] ?? null;
  const ageMinutes = minutesSince(active?.lastSyncAt);
  const freshness = syncState(ageMinutes);
  const status = (active?.providerStatus ?? active?.status ?? "").toLowerCase();
  const accountHealth: AccountsContext["accountHealth"] =
    !active
      ? "not_connected"
      : status.includes("sync")
        ? "syncing"
        : status.includes("fail") || status.includes("error")
          ? "offline"
          : freshness === "old"
            ? "stale"
            : status.includes("connect") || freshness === "fresh"
              ? "connected"
              : "unknown";

  return {
    activeAccountId,
    accounts,
    hasCloudMt5: accounts.some((a) => a.connectionMethod === "cloud_mt5"),
    activeLabel: active?.label ?? null,
    activeServer: active?.mt5Server ?? null,
    accountHealth,
    syncFreshness: {
      lastSyncAt: active?.lastSyncAt ?? null,
      ageMinutes,
      state: freshness,
    },
    activeSymbols: Object.keys(active?.symbolMap ?? {}).sort(),
    activeSymbolMap: active?.symbolMap ?? {},
    activeSymbolResolutionReport: active?.symbolResolutionReport ?? {},
    openExposure: { positionsCount: 0, symbols: [], netBySymbol: [] },
  };
}

async function buildChart(
  supabase: SupabaseClient,
  userId: string,
  symbol: string | null,
  tf: string | null,
  activeAccountId: string | null,
): Promise<ChartContext> {
  if (!activeAccountId) return { ...EMPTY_CHART, symbol, timeframe: tf };
  let query = supabase
    .from("chart_live_snapshots")
    .select("account_id,display_symbol,broker_symbol,timeframe,last_price,last_bid,last_ask,last_tick_at,last_candle_at,last_candle,open_positions_count,open_positions,status,source,updated_at")
    .eq("user_id", userId)
    .eq("account_id", activeAccountId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (symbol) query = query.eq("display_symbol", symbol);
  if (tf) query = query.eq("timeframe", tf);

  const { data } = await query;
  const row = (data?.[0] ?? null) as Record<string, unknown> | null;
  if (!row) return { ...EMPTY_CHART, symbol, timeframe: tf, accountId: activeAccountId };
  const displaySymbol = (row.display_symbol as string | null | undefined) ?? symbol;
  const positions = Array.isArray(row.open_positions)
    ? (row.open_positions as Array<Record<string, unknown>>).map((p) => normalizePosition(p, displaySymbol))
    : [];
  const lastCandle =
    row.last_candle && typeof row.last_candle === "object" && !Array.isArray(row.last_candle)
      ? (row.last_candle as Record<string, unknown>)
      : null;
  const candleClose = lastCandle?.close != null ? Number(lastCandle.close) : null;
  const candleTime =
    (lastCandle?.time as string | null | undefined) ??
    (lastCandle?.brokerTime as string | null | undefined) ??
    null;
  const status = (row.status as string | null | undefined) ?? null;
  const updatedAt = (row.updated_at as string | null | undefined) ?? null;

  return {
    symbol: displaySymbol,
    timeframe: (row.timeframe as string | null | undefined) ?? tf,
    brokerSymbol: (row.broker_symbol as string | null | undefined) ?? null,
    accountId: (row.account_id as string | null | undefined) ?? activeAccountId,
    lastPrice: row.last_price != null ? Number(row.last_price) : null,
    lastBid: row.last_bid != null ? Number(row.last_bid) : null,
    lastAsk: row.last_ask != null ? Number(row.last_ask) : null,
    lastTickAt: (row.last_tick_at as string | null | undefined) ?? null,
    lastCandleAt: (row.last_candle_at as string | null | undefined) ?? null,
    liveStatus: status,
    source: (row.source as string | null | undefined) ?? null,
    updatedAt,
    openPositionsCount: row.open_positions_count != null ? Number(row.open_positions_count) : null,
    staleState: staleState(updatedAt, status),
    relatedOpenPositions: positions.filter((p) => !displaySymbol || p.symbol === displaySymbol),
    recentState:
      candleClose != null || candleTime
        ? `Last candle${candleTime ? ` ${candleTime}` : ""}${candleClose != null ? ` close ${candleClose}` : ""}`
        : null,
  };
}

async function buildTrades(
  supabase: SupabaseClient,
  userId: string,
  activeAccountId: string | null,
): Promise<TradesJournalContext> {
  const journalPromise = supabase
    .from("user_journal_entries")
    .select("symbol,notes,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (!activeAccountId) {
    const { data } = await journalPromise;
    return {
      ...EMPTY_TRADES,
      journalEntries: ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        symbol: String(r.symbol ?? ""),
        notes: String(r.notes ?? ""),
        created_at: String(r.created_at ?? ""),
      })),
    };
  }

  const [tradesRes, journalRes] = await Promise.all([
    supabase
      .from("broker_trades")
      .select("id,symbol,side,volume,pnl,close_time")
      .eq("user_id", userId)
      .eq("account_id", activeAccountId)
      .order("close_time", { ascending: false, nullsFirst: false })
      .limit(25),
    journalPromise,
  ]);

  const recentTrades: CompanionBrokerTrade[] = ((tradesRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    symbol: String(r.symbol ?? ""),
    side: String(r.side ?? ""),
    volume: Number(r.volume ?? 0) || 0,
    pnl: Number(r.pnl ?? 0) || 0,
    close_time: (r.close_time as string | null | undefined) ?? null,
  }));

  let labels: CompanionTradeLabel[] = [];
  const tradeIds = recentTrades.map((t) => t.id);
  if (tradeIds.length > 0) {
    const labelsRes = await supabase
      .from("trade_journal_labels")
      .select("trade_id,label,note")
      .eq("user_id", userId)
      .in("trade_id", tradeIds);
    const symbolByTrade = new Map(recentTrades.map((t) => [t.id, t.symbol]));
    labels = ((labelsRes.data ?? []) as Array<Record<string, unknown>>).map((r) => {
      const tradeId = String(r.trade_id ?? "");
      return {
        trade_id: tradeId,
        symbol: symbolByTrade.get(tradeId) ?? "—",
        label: (r.label as string | null | undefined) ?? null,
        note: (r.note as string | null | undefined) ?? null,
      };
    });
  }

  const journalEntries: CompanionJournalEntry[] = ((journalRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    symbol: String(r.symbol ?? ""),
    notes: String(r.notes ?? ""),
    created_at: String(r.created_at ?? ""),
  }));
  const labelMap = new Map<string, number>();
  for (const label of labels) {
    const key = (label.label ?? "").trim();
    if (!key) continue;
    labelMap.set(key, (labelMap.get(key) ?? 0) + 1);
  }
  const labelCounts = Array.from(labelMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const recurringLabels = labelCounts.filter((l) => l.count >= 2).map((l) => l.label);
  const journalText = journalEntries.map((j) => j.notes.toLowerCase()).join(" ");
  const riskPatterns = compactList([
    journalText.match(/\bfomo\b|chase|late entry/) ? "chasing/fomo language appears in journal" : "",
    journalText.match(/revenge|overtrade/) ? "revenge or overtrading language appears in journal" : "",
    journalText.match(/risk|lot|size|too big/) ? "risk sizing is being mentioned repeatedly" : "",
    recurringLabels.length > 0 ? `recurring labels: ${recurringLabels.join(", ")}` : "",
  ]);

  return {
    activeAccountId,
    recentTrades,
    labels,
    journalEntries,
    analytics: {
      totalTrades: recentTrades.length,
      totalPnl: recentTrades.reduce((sum, t) => sum + t.pnl, 0),
      wins: recentTrades.filter((t) => t.pnl > 0).length,
      losses: recentTrades.filter((t) => t.pnl < 0).length,
    },
    labelCounts,
    recurringLabels,
    riskPatterns,
    recentWins: recentTrades.filter((t) => t.pnl > 0).slice(0, 5),
    recentMistakes: recentTrades.filter((t) => t.pnl < 0).slice(0, 5),
  };
}

async function buildAlerts(
  supabase: SupabaseClient,
  userId: string,
  symbol: string | null,
): Promise<AlertsContext> {
  const { data } = await supabase
    .from("user_alerts")
    .select("symbol,type,condition,threshold,keyword,status,triggered_at,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(40);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const recent = rows.slice(0, 8).map(mapUserAlert);
  const symbolAlerts = symbol
    ? rows.filter((r) => String(r.symbol ?? "").toUpperCase() === symbol).map(mapUserAlert)
    : [];

  return {
    active: rows.filter((r) => r.status === "active").length,
    paused: rows.filter((r) => r.status === "paused").length,
    triggered: rows.filter((r) => r.triggered_at != null).length,
    recent,
    symbolAlerts,
  };
}

async function buildMemory(supabase: SupabaseClient, userId: string): Promise<MemoryContext> {
  const [memoryRes, commitmentsRes] = await Promise.all([
    supabase
      .from("assistant_memory_entries")
      .select("scope,entry_key,content")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("axe_commitments")
      .select("id,symbol,description,created_at")
      .eq("user_id", userId)
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(10),
  ]);

  const entries: AxeMemoryEntry[] = ((memoryRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    scope: String(r.scope ?? ""),
    entryKey: (r.entry_key as string | null | undefined) ?? null,
    content: String(r.content ?? ""),
  }));
  const seen = new Set<string>();
  const prioritizedEntries = entries.filter((entry) => {
    const key = `${entry.scope}:${entry.entryKey ?? ""}:${entry.content.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 14);
  const compactSummary =
    prioritizedEntries.length > 0
      ? prioritizedEntries
          .slice(0, 8)
          .map((m) => `${[m.scope, m.entryKey].filter(Boolean).join("/")}: ${m.content.slice(0, 140)}`)
          .join(" | ")
      : null;

  return {
    entries,
    prioritizedEntries,
    openCommitments: (commitmentsRes.data ?? []) as OpenCommitment[],
    compactSummary,
  };
}

async function buildIntel(symbol: string | null): Promise<IntelContext> {
  const intel = await loadIntelSnapshot({ symbol: symbol ?? undefined });
  const summary = mapIntelSummary(intel);
  const compact: string[] = [];
  if (summary?.tideBias) compact.push(`tide ${summary.tideBias}`);
  if (summary?.topDarkPool.length) {
    compact.push(
      `dark pool ${summary.topDarkPool
        .map((r) => `${r.symbol} $${(r.notional / 1e6).toFixed(1)}M`)
        .join(", ")}`,
    );
  }
  if (summary?.topOptions.length) {
    compact.push(
      `options ${summary.topOptions
        .map((r) => `${r.symbol} ${r.side} $${(r.premium / 1e6).toFixed(1)}M`)
        .join(", ")}`,
    );
  }
  return {
    symbol,
    summary,
    providers: intel.providers,
    compactSummary: compact.length > 0 ? compact.join(" | ") : intel.cache.message ?? null,
    providerHealth: intel.providers.map((p) => ({ id: p.id, state: p.state, label: p.label })),
    cache: intel.cache,
    hasLiveData: intel.hasLiveData,
  };
}

async function buildMarket(
  symbol: string | null,
  watchlist: WatchlistEntry[],
): Promise<MarketContextSummary> {
  const activeSymbol = symbol ?? watchlist[0]?.symbol ?? "XAUUSD";
  const raw = await buildMarketContext({
    symbol: activeSymbol,
    watchlist: watchlist.map((w) => w.symbol),
    newsLimit: 8,
    calendarLimit: 12,
  });
  return {
    symbol: raw.symbol,
    summary: summarizeMarketContext(raw),
    providers: raw.providers,
    hasLiveData: raw.hasLiveData,
    raw,
  };
}

async function buildLegacy(
  supabase: SupabaseClient,
  userId: string,
  symbol: string | null,
): Promise<LegacyContextParts> {
  const [execRes, liveAccountRes, livePositionsRes, closedPositionsRes] = await Promise.all([
    supabase
      .from("execution_requests")
      .select("symbol,instrument,direction,status,notes,rationale")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("mt5_account_snapshots")
      .select("account_id,balance,equity,margin,free_margin,leverage,currency,server,name,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("mt5_positions")
      .select("id,account_id,symbol,type,volume,open_price,current_price,profit,swap,stop_loss,take_profit,opened_at,comment")
      .eq("user_id", userId)
      .order("opened_at", { ascending: true }),
    supabase
      .from("mt5_closed_positions")
      .select("id,account_id,symbol,type,volume,open_price,close_price,profit,swap,commission,opened_at,closed_at,close_reason,comment")
      .eq("user_id", userId)
      .order("closed_at", { ascending: false })
      .limit(20),
  ]);

  const recentExecutions: TerminalExecution[] = ((execRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    symbol: ((r.symbol as string | null | undefined) ?? (r.instrument as string | null | undefined)) ?? null,
    direction: (r.direction as string | null | undefined) ?? null,
    status: (r.status as string | null | undefined) ?? null,
    notes: ((r.notes as string | null | undefined) ?? (r.rationale as string | null | undefined)) ?? null,
  }));

  const filteredNews: FilteredNewsEvent[] = [];
  const liveAccount = (liveAccountRes.data ?? null) as Mt5AccountSnapshot | null;
  const livePositions = (livePositionsRes.data ?? []) as Mt5Position[];
  const closedPositions = (closedPositionsRes.data ?? []) as Mt5ClosedPosition[];

  if (symbol) {
    void symbol;
  }

  return {
    filteredNews,
    recentExecutions,
    liveAccount,
    livePositions,
    closedPositions,
  };
}

function keyLevelsFromWatchlist(watchlist: WatchlistEntry[], symbol: string | null): string[] {
  const levels: string[] = [];
  for (const w of watchlist) {
    if (symbol && w.symbol.toUpperCase() !== symbol) continue;
    const payload = w.condition_payload ?? {};
    const price = payload.price ?? payload.level ?? payload.entry ?? payload.trigger ?? payload.value;
    if (price === undefined) continue;
    const condition = w.condition_type ?? w.kind ?? "";
    levels.push(`${w.symbol} ${price}${condition ? ` (${condition})` : ""}`);
  }
  return levels;
}

function enrichAccounts(
  accounts: AccountsContext,
  chart: ChartContext,
  trades: TradesJournalContext,
  watchlist: WatchlistEntry[],
): AccountsContext {
  const exposure = summarizeOpenExposure(chart.relatedOpenPositions);
  const activeSymbols = compactList([
    ...watchlist.map((w) => w.symbol),
    ...(chart.symbol ? [chart.symbol] : []),
    ...trades.recentTrades.map((t) => t.symbol),
    ...exposure.symbols,
  ], 12);
  return {
    ...accounts,
    activeSymbols,
    openExposure: exposure,
  };
}

function buildCorrelations(ctx: {
  symbol: string | null;
  chart: ChartContext;
  accounts: AccountsContext;
  trades: TradesJournalContext;
  intel: IntelContext;
  market: MarketContextSummary;
}): CorrelationInsight[] {
  const insights: CorrelationInsight[] = [];
  const exposureSymbols = ctx.accounts.openExposure.symbols;
  const marketText = [
    ctx.market.summary ?? "",
    ...(ctx.market.raw?.news ?? []).slice(0, 4).map((n) => n.title),
    ...(ctx.market.raw?.events ?? []).slice(0, 4).map((e) => `${e.title} ${e.impact}`),
  ].join(" ").toLowerCase();

  for (const symbol of exposureSymbols) {
    const root = symbol.slice(0, 3).toLowerCase();
    const hasRelevantMarket =
      marketText.includes(symbol.toLowerCase()) ||
      (symbol.includes("XAU") && /gold|xau|usd|cpi|fomc|nfp|rate|yield/.test(marketText)) ||
      (["BTC", "ETH", "SOL"].some((c) => symbol.includes(c)) && /crypto|bitcoin|ethereum|btc|eth/.test(marketText)) ||
      (root && marketText.includes(root));
    if (hasRelevantMarket) {
      insights.push({
        kind: "exposure_market",
        severity: "watch",
        symbol,
        message: `Open ${symbol} exposure overlaps with current market/news context.`,
        evidence: compactList([ctx.market.summary ?? "", `${ctx.accounts.openExposure.positionsCount} open chart positions`], 3),
      });
    }
  }

  const highImpact = (ctx.market.raw?.events ?? []).find((e) => e.impact === "high");
  if (highImpact && ctx.accounts.openExposure.positionsCount > 0) {
    insights.push({
      kind: "event_risk",
      severity: "risk",
      symbol: ctx.symbol,
      message: `High-impact event risk is present while exposure is open.`,
      evidence: [`${highImpact.title} ${highImpact.currency ?? highImpact.country ?? ""}`.trim()],
    });
  }

  if (ctx.intel.compactSummary && ctx.accounts.openExposure.positionsCount > 0) {
    insights.push({
      kind: "exposure_intel",
      severity: ctx.intel.cache.state === "stale" ? "info" : "watch",
      symbol: ctx.symbol,
      message: `Open exposure should be read against current smart-money intel.`,
      evidence: [ctx.intel.compactSummary, `intel cache ${ctx.intel.cache.state}`],
    });
  }

  if (ctx.trades.analytics.totalPnl < 0 && ctx.trades.riskPatterns.length > 0) {
    insights.push({
      kind: "performance_journal",
      severity: "risk",
      symbol: ctx.symbol,
      message: `Recent drawdown overlaps with recurring journal/risk patterns.`,
      evidence: [`P/L ${ctx.trades.analytics.totalPnl.toFixed(2)}`, ...ctx.trades.riskPatterns.slice(0, 2)],
    });
  }

  return insights.slice(0, 6);
}

function buildSummary(ctx: Omit<AxeCompanionContext, "summary">): string {
  const lines: string[] = [];
  lines.push(`AXE Companion operating brief generated ${ctx.generatedAt}.`);
  lines.push(`Focus: ${ctx.symbol ?? "no active symbol"}${ctx.timeframe ? ` · ${ctx.timeframe}` : ""}.`);
  if (ctx.accounts.activeLabel) {
    const sync = ctx.accounts.syncFreshness;
    const activeDoctor = ctx.accounts.accounts.find((account) => account.active)?.mt5Doctor ?? null;
    lines.push(
      `Account health: ${ctx.accounts.activeLabel}${ctx.accounts.activeServer ? ` @ ${ctx.accounts.activeServer}` : ""}; ${ctx.accounts.accountHealth}; sync ${sync.state}${sync.ageMinutes != null ? ` (${sync.ageMinutes}m old)` : ""}.`,
    );
    if (activeDoctor) {
      const readable = [
        activeDoctor.positionsReadable === true ? "positions readable" : activeDoctor.positionsReadable === false ? "positions blocked" : "positions unknown",
        activeDoctor.historyReadable === true ? "history readable" : activeDoctor.historyReadable === false ? "history blocked" : "history unknown",
        activeDoctor.livePricesAvailable === true ? "live prices available" : activeDoctor.livePricesAvailable === false ? "live prices blocked" : "live prices unknown",
      ].join(", ");
      lines.push(
        `MT5 doctor: ${activeDoctor.overallStatus}; ${readable}; trading ${activeDoctor.tradingState}; ${activeDoctor.knownFailureReason ?? activeDoctor.headline}.`,
      );
    }
    const mappedSymbols = Object.entries(ctx.accounts.activeSymbolMap)
      .slice(0, 12)
      .map(([display, broker]) => `${display}->${broker}`);
    const unresolvedSymbols = Object.values(ctx.accounts.activeSymbolResolutionReport)
      .filter((entry) => !entry.resolved)
      .slice(0, 6)
      .map((entry) => `${entry.displaySymbol}:${entry.reason}`);
    if (mappedSymbols.length > 0 || unresolvedSymbols.length > 0) {
      lines.push(
        `Broker symbols: ${mappedSymbols.length > 0 ? mappedSymbols.join(", ") : "none mapped"}${unresolvedSymbols.length > 0 ? `; unresolved ${unresolvedSymbols.join(", ")}` : ""}.`,
      );
    }
  }
  if (ctx.accounts.openExposure.positionsCount > 0) {
    const exposure = ctx.accounts.openExposure.netBySymbol
      .map((e) => `${e.symbol} ${e.direction} ${Math.abs(e.netVolume)}`)
      .join(", ");
    lines.push(`Exposure: ${ctx.accounts.openExposure.positionsCount} open positions${exposure ? `; ${exposure}` : ""}.`);
  }
  const chartPricingState = brokerPricingState({
    status: ctx.chart.liveStatus,
    updatedAt: ctx.chart.updatedAt,
    lastTickAt: ctx.chart.lastTickAt,
    lastCandleAt: ctx.chart.lastCandleAt,
  });
  if (ctx.chart.lastPrice != null && (chartPricingState === "live" || chartPricingState === "degraded")) {
    lines.push(
      `Chart: ${ctx.chart.symbol ?? ctx.symbol} ${ctx.chart.timeframe ?? ""} broker ${ctx.chart.brokerSymbol ?? "unresolved"} canonical ${ctx.chart.lastPrice}; ${chartPricingState}; ${ctx.chart.recentState ?? "no recent candle"}.`,
    );
  } else if (ctx.chart.symbol) {
    lines.push(
      `Chart: ${ctx.chart.symbol} broker ${ctx.chart.brokerSymbol ?? "unresolved"}; live broker pricing unavailable; do not invent current price or levels.`,
    );
  }
  if (ctx.trades.recentTrades.length > 0) {
    lines.push(
      `Trades: ${ctx.trades.recentTrades.length} recent, P/L ${ctx.trades.analytics.totalPnl.toFixed(2)}, W/L ${ctx.trades.analytics.wins}/${ctx.trades.analytics.losses}.`,
    );
  }
  if (ctx.trades.recurringLabels.length || ctx.trades.riskPatterns.length) {
    lines.push(
      `Journal patterns: ${[...ctx.trades.recurringLabels, ...ctx.trades.riskPatterns].slice(0, 5).join(" | ")}.`,
    );
  }
  if (ctx.alerts.active || ctx.alerts.paused) {
    lines.push(`Alerts: ${ctx.alerts.active} active, ${ctx.alerts.paused} paused, ${ctx.alerts.triggered} triggered.`);
  }
  if (ctx.intel.compactSummary) lines.push(`Intel: ${ctx.intel.compactSummary}; cache ${ctx.intel.cache.state}.`);
  if (ctx.memory.compactSummary) lines.push(`Memory: ${ctx.memory.compactSummary}`);
  if (ctx.correlations.length > 0) lines.push(`Correlations: ${ctx.correlations.map((c) => c.message).join(" | ")}`);
  if (ctx.market.summary) lines.push(ctx.market.summary);
  const degraded = ctx.health.filter((h) => h.state === "timeout" || h.state === "error");
  if (degraded.length > 0) {
    lines.push(`Partial context: ${degraded.map((h) => `${h.section} ${h.state}`).join(", ")}. Keep answering from available sections and name stale/missing data clearly.`);
  }
  return lines.join("\n").slice(0, 4_000);
}

export async function buildAxeCompanionContext(args: BuilderArgs): Promise<AxeCompanionContext> {
  const symbol = normalizeSymbol(args.symbol);
  const timeframe = args.tf?.trim() || null;
  const generatedAt = nowIso();

  const [settingsRes, memoryRes, accountsRes] = await Promise.all([
    withAdapter("settings", EMPTY_SETTINGS, () => buildSettings(args.supabase, args.userId, args.pinnedContext)),
    withAdapter("memory", EMPTY_MEMORY, () => buildMemory(args.supabase, args.userId)),
    withAdapter("accounts", EMPTY_ACCOUNTS, () => buildAccounts(args.supabase, args.userId)),
  ]);

  const watchlist = settingsRes.value.watchlist;
  const activeAccountId = accountsRes.value.activeAccountId;

  const [chartRes, tradesRes, intelRes, alertsRes, marketRes] = await Promise.all([
    withAdapter("chart", { ...EMPTY_CHART, symbol, timeframe }, () =>
      buildChart(args.supabase, args.userId, symbol, timeframe, activeAccountId),
    ),
    withAdapter("trades", EMPTY_TRADES, () => buildTrades(args.supabase, args.userId, activeAccountId)),
    withAdapter("intel", { ...EMPTY_INTEL, symbol }, () => buildIntel(symbol), INTEL_TIMEOUT_MS),
    withAdapter("alerts", EMPTY_ALERTS, () => buildAlerts(args.supabase, args.userId, symbol)),
    withAdapter("market", { ...EMPTY_MARKET, symbol }, () => buildMarket(symbol, watchlist), MARKET_TIMEOUT_MS),
  ]);

  const accounts = enrichAccounts(accountsRes.value, chartRes.value, tradesRes.value, watchlist);
  const correlations = buildCorrelations({
    symbol,
    chart: chartRes.value,
    accounts,
    trades: tradesRes.value,
    intel: intelRes.value,
    market: marketRes.value,
  });

  const contextWithoutSummary = {
    generatedAt,
    symbol,
    timeframe,
    settings: settingsRes.value,
    accounts,
    chart: chartRes.value,
    trades: tradesRes.value,
    intel: intelRes.value,
    alerts: alertsRes.value,
    market: marketRes.value,
    memory: memoryRes.value,
    correlations,
    health: [
      settingsRes.health,
      accountsRes.health,
      chartRes.health,
      tradesRes.health,
      intelRes.health,
      alertsRes.health,
      marketRes.health,
      memoryRes.health,
    ],
  };

  return {
    ...contextWithoutSummary,
    summary: buildSummary(contextWithoutSummary),
  };
}

export async function buildTradingOSCompatibleContext(args: BuilderArgs): Promise<TradingOSContext> {
  const axeContext = await buildAxeCompanionContext(args);
  const legacyRes = await withAdapter(
    "legacy",
    {
      filteredNews: [],
      recentExecutions: [],
      liveAccount: null,
      livePositions: [],
      closedPositions: [],
    },
    () => buildLegacy(args.supabase, args.userId, axeContext.symbol),
  );

  const companionAccounts: CompanionBrokerAccount[] = axeContext.accounts.accounts.map((a) => ({
    id: a.id,
    label: a.label,
    provider: a.provider,
    status: a.providerStatus ?? a.status,
  }));

  const legacyLivePositions: Mt5Position[] =
    legacyRes.value.livePositions.length > 0
      ? legacyRes.value.livePositions
      : axeContext.chart.relatedOpenPositions.map((p) => ({
          id: p.id,
          account_id: axeContext.accounts.activeAccountId ?? "",
          symbol: p.symbol,
          type: p.side === "sell" ? "SELL" : "BUY",
          volume: p.volume,
          open_price: p.entryPrice ?? 0,
          current_price: p.currentPrice,
          profit: p.profit,
          swap: null,
          stop_loss: p.stopLoss,
          take_profit: p.takeProfit,
          opened_at: null,
          comment: "chart_live_snapshot",
        }));

  return {
    symbol: axeContext.symbol,
    timeframe: axeContext.timeframe,
    filtered_news: legacyRes.value.filteredNews,
    account_state: {
      watchlist: axeContext.settings.watchlist,
      recentAlerts: axeContext.alerts.recent,
      recentExecutions: legacyRes.value.recentExecutions,
    },
    user_memory: axeContext.memory.prioritizedEntries.map((m) => ({
      scope: m.scope,
      entry_key: m.entryKey,
      content: m.content,
    })),
    candles_summary: axeContext.settings.pinnedContext,
    key_levels: keyLevelsFromWatchlist(axeContext.settings.watchlist, axeContext.symbol),
    open_commitments: axeContext.memory.openCommitments,
    live_account: legacyRes.value.liveAccount,
    live_positions: legacyLivePositions,
    closed_positions: legacyRes.value.closedPositions,
    knowledge_layer: null,
    companion_accounts: companionAccounts,
    companion_active_account_id: axeContext.accounts.activeAccountId,
    companion_broker_trades: axeContext.trades.recentTrades,
    companion_trade_labels: axeContext.trades.labels,
    companion_journal_entries: axeContext.trades.journalEntries,
    intel_summary: axeContext.intel.summary,
    axe_context: {
      ...axeContext,
      health: [...axeContext.health, legacyRes.health],
    },
  };
}
