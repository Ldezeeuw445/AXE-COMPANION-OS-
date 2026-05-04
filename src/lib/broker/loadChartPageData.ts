import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listWatchlistItems } from "@/app/(app)/settings/actions";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import {
  clientGetHistoricalCandles,
  clientGetPositions,
  MetaApiRequestError,
  type MetaApiCandle,
} from "@/lib/mt5/metaApiClient";
import { metaApiTimeframeFromKey, normalizeChartTfKey } from "@/lib/broker/chartTimeframes";
import { resolveBrokerSymbol } from "@/lib/broker/symbolResolution";
import type { OpenPositionRow } from "@/lib/broker/loadPositionsPageData";

const DEFAULT_SYMBOL = "XAUUSD";
const FALLBACK_SYMBOLS = ["XAUUSD", "EURUSD", "BTCUSD"];

export type ChartOverlayRow = {
  id: string;
  side: string;
  volume: number;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  profit: number | null;
  openTime: string | null;
  /** Live/last current price snapshot (broker). */
  currentPrice: number | null;
};

export type AccountSummary = {
  brokerAccountId: string;
  metaApiAccountId: string;
  label: string;
  mt5Server: string | null;
  active: boolean;
};

export type ChartFailureKind =
  | "ok"
  | "account_not_connected"
  | "broker_symbol_not_found"
  | "candles_unavailable"
  | "timeframe_unavailable"
  | "live_stream_unavailable"
  | "market_data_unavailable"
  | "provider_not_configured";

export type ChartPageData = {
  /** Display symbol the UI shows in headers. */
  symbol: string;
  /** Broker-resolved symbol used for actual MetaApi calls. */
  brokerSymbol: string;
  timeframeKey: string;
  metaApiTimeframe: string;
  candles: MetaApiCandle[];
  positionsOnSymbol: ChartOverlayRow[];
  positionsOnSymbolCount: number;
  totalPositions: number;
  lastPrice: number | null;
  providerStatus: string | null;
  failure: ChartFailureKind;
  /** Friendly error sentence for failure. */
  dataError: string | null;
  /** Optional helper hint shown under the chart. */
  hint: string | null;
  symbolOptions: string[];
  attemptedSymbols: string[];
  /** Diagnostics for "Data details" panel. */
  account: AccountSummary | null;
  accountChoices: AccountSummary[];
  /** ISO of the last candle close time (broker time). */
  lastCandleTime: string | null;
  /** "MetaApi MT5" — keeps copy honest. */
  source: "MetaApi MT5";
};

function mapSide(t: string | undefined): string {
  const u = (t ?? "").toUpperCase();
  if (u.includes("BUY")) return "buy";
  if (u.includes("SELL")) return "sell";
  return (t ?? "").toLowerCase();
}

function normalizeSymbol(raw: string | undefined): string {
  const s = (raw ?? "").trim().toUpperCase().replace(/[^A-Z0-9._+\-]/g, "");
  return s;
}

function mapPositions(raw: Record<string, unknown>[]): OpenPositionRow[] {
  return raw.map((p, i) => {
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
}

function toOverlay(p: OpenPositionRow): ChartOverlayRow {
  return {
    id: p.id,
    side: p.side,
    volume: p.volume,
    entryPrice: p.openPrice,
    stopLoss: p.stopLoss,
    takeProfit: p.takeProfit,
    profit: p.profit,
    openTime: p.openTime,
    currentPrice: p.currentPrice,
  };
}

function emptyData(
  timeframeKey: string,
  metaApiTimeframe: string,
  symbol: string,
  hint: string | null,
  failure: ChartFailureKind = "ok",
  providerStatus: string | null = null,
  dataError: string | null = null,
): ChartPageData {
  return {
    symbol,
    brokerSymbol: symbol,
    timeframeKey,
    metaApiTimeframe,
    candles: [],
    positionsOnSymbol: [],
    positionsOnSymbolCount: 0,
    totalPositions: 0,
    lastPrice: null,
    providerStatus,
    failure,
    dataError,
    hint,
    symbolOptions: [...FALLBACK_SYMBOLS],
    attemptedSymbols: [],
    account: null,
    accountChoices: [],
    lastCandleTime: null,
    source: "MetaApi MT5",
  };
}

export async function loadChartPageData(
  symbolParam: string | undefined,
  tfParam: string | undefined,
  accountParam: string | undefined,
): Promise<ChartPageData> {
  const timeframeKey = normalizeChartTfKey(tfParam);
  const metaApiTimeframe = metaApiTimeframeFromKey(timeframeKey);

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return emptyData(timeframeKey, metaApiTimeframe, DEFAULT_SYMBOL, "Supabase is not configured.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return emptyData(timeframeKey, metaApiTimeframe, DEFAULT_SYMBOL, "Sign in to load your MT5 chart.");
  }

  const [{ data: prefs }, { data: accountsRows }, watchlistRows] = await Promise.all([
    supabase
      .from("user_workspace_preferences")
      .select("active_account_id")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("user_broker_accounts")
      .select("id,label,connection_method,external_connection_id,mt5_server,provider_status,metadata")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    listWatchlistItems(),
  ]);

  const cloudAccounts: AccountSummary[] = (accountsRows ?? [])
    .filter(
      (r) =>
        r.connection_method === "cloud_mt5" &&
        typeof r.external_connection_id === "string" &&
        r.external_connection_id.length > 0,
    )
    .map((r) => ({
      brokerAccountId: r.id as string,
      metaApiAccountId: r.external_connection_id as string,
      label: (r.label as string) ?? "MT5 Account",
      mt5Server: (r.mt5_server as string) ?? null,
      active: prefs?.active_account_id === r.id,
    }));

  const requestedAccountId = (accountParam ?? "").trim();
  const account =
    cloudAccounts.find((a) => a.brokerAccountId === requestedAccountId) ??
    cloudAccounts.find((a) => a.active) ??
    cloudAccounts[0] ??
    null;

  const watchSyms = watchlistRows.map((w) => w.symbol.trim().toUpperCase()).filter(Boolean);

  if (!getMetaApiToken()) {
    const requested = normalizeSymbol(symbolParam) || DEFAULT_SYMBOL;
    const out = emptyData(
      timeframeKey,
      metaApiTimeframe,
      requested,
      "Provider is not configured on the server. Add your MetaApi token to enable broker data.",
      "provider_not_configured",
      "provider_not_configured",
      "Chart data is not available because MetaApi is not configured for this deployment.",
    );
    out.symbolOptions = Array.from(new Set([...FALLBACK_SYMBOLS, ...watchSyms])).sort();
    out.accountChoices = cloudAccounts;
    return out;
  }

  if (!account) {
    const requested = normalizeSymbol(symbolParam) || DEFAULT_SYMBOL;
    const out = emptyData(
      timeframeKey,
      metaApiTimeframe,
      requested,
      "Connect a MetaApi MT5 cloud account to unlock the broker chart.",
      "account_not_connected",
      null,
      "No MetaApi MT5 account is connected yet.",
    );
    out.symbolOptions = Array.from(new Set([...FALLBACK_SYMBOLS, ...watchSyms])).sort();
    out.accountChoices = cloudAccounts;
    return out;
  }

  let allPositions: OpenPositionRow[] = [];
  try {
    const raw = (await clientGetPositions(account.metaApiAccountId, true)) as Record<string, unknown>[];
    allPositions = mapPositions(raw);
  } catch {
    allPositions = [];
  }

  const fromPositions = allPositions.map((p) => p.symbol).filter(Boolean);
  const accountRaw = (accountsRows ?? []).find((r) => r.id === account.brokerAccountId);
  const accountMetadata = (accountRaw?.metadata ?? {}) as { symbol_map?: Record<string, string> };
  const symbolMap = accountMetadata.symbol_map ?? {};
  const knownFromMetadata = Object.values(symbolMap).filter((s): s is string => typeof s === "string" && s.length > 0);
  const knownAccountSymbols = Array.from(new Set([...fromPositions, ...knownFromMetadata]));
  const requested = normalizeSymbol(symbolParam) || allPositions[0]?.symbol || watchSyms[0] || DEFAULT_SYMBOL;
  const cachedBroker = symbolMap[requested];
  const resolution = cachedBroker
    ? {
        brokerSymbol: cachedBroker,
        displaySymbol: requested,
        exact: cachedBroker === requested,
        attempted: [requested, cachedBroker].filter((v, i, a) => a.indexOf(v) === i),
        reason: cachedBroker === requested ? ("exact_match" as const) : ("suffix_variant" as const),
      }
    : resolveBrokerSymbol(requested, knownAccountSymbols);

  const symbolSet = new Set<string>([
    requested,
    resolution.brokerSymbol,
    ...FALLBACK_SYMBOLS,
    ...watchSyms,
    ...fromPositions,
  ]);
  symbolSet.delete("");
  const symbolOptions = [...symbolSet].sort();

  const positionsOnSymbol = allPositions
    .filter((p) => p.symbol === resolution.brokerSymbol || p.symbol === requested)
    .map(toOverlay);

  try {
    const candles = await clientGetHistoricalCandles(
      account.metaApiAccountId,
      resolution.brokerSymbol,
      metaApiTimeframe,
      500,
    );
    const last = candles.length > 0 ? candles[candles.length - 1]?.close ?? null : null;
    const lastTime = candles.length > 0 ? candles[candles.length - 1]?.time ?? null : null;

    // Persist successful broker symbol resolution per account.
    if (candles.length > 0 && symbolMap[requested] !== resolution.brokerSymbol) {
      const nextMetadata = { ...accountMetadata, symbol_map: { ...symbolMap, [requested]: resolution.brokerSymbol } };
      void supabase
        .from("user_broker_accounts")
        .update({ metadata: nextMetadata })
        .eq("id", account.brokerAccountId)
        .eq("user_id", user.id);
    }

    if (candles.length === 0) {
      return {
        symbol: requested,
        brokerSymbol: resolution.brokerSymbol,
        timeframeKey,
        metaApiTimeframe,
        candles: [],
        positionsOnSymbol,
        positionsOnSymbolCount: positionsOnSymbol.length,
        totalPositions: allPositions.length,
        lastPrice: null,
        providerStatus: "connected",
        failure: "candles_unavailable",
        dataError: "MT5 market data not available for this symbol yet.",
        hint: "MetaApi could not return candles. Try Sync, another timeframe, or check the broker symbol in Data details.",
        symbolOptions,
        attemptedSymbols: resolution.attempted,
        account,
        accountChoices: cloudAccounts,
        lastCandleTime: null,
        source: "MetaApi MT5",
      };
    }

    return {
      symbol: requested,
      brokerSymbol: resolution.brokerSymbol,
      timeframeKey,
      metaApiTimeframe,
      candles,
      positionsOnSymbol,
      positionsOnSymbolCount: positionsOnSymbol.length,
      totalPositions: allPositions.length,
      lastPrice: last != null && !Number.isNaN(last) ? last : null,
      providerStatus: "connected",
      failure: "ok",
      dataError: null,
      hint: null,
      symbolOptions,
      attemptedSymbols: resolution.attempted,
      account,
      accountChoices: cloudAccounts,
      lastCandleTime: lastTime,
      source: "MetaApi MT5",
    };
  } catch (e) {
    const isMeta = e instanceof MetaApiRequestError;
    const code = isMeta ? e.code : null;
    const failure: ChartFailureKind =
      code === "not_found"
        ? "broker_symbol_not_found"
        : code === "metaapi_region_error" || code === "metaapi_auth_failed"
          ? "market_data_unavailable"
          : "candles_unavailable";

    return {
      symbol: requested,
      brokerSymbol: resolution.brokerSymbol,
      timeframeKey,
      metaApiTimeframe,
      candles: [],
      positionsOnSymbol,
      positionsOnSymbolCount: positionsOnSymbol.length,
      totalPositions: allPositions.length,
      lastPrice: null,
      providerStatus: "failed",
      failure,
      dataError:
        failure === "broker_symbol_not_found"
          ? "Broker symbol not found on this account."
          : "MT5 market data not available for this symbol yet.",
      hint:
        failure === "broker_symbol_not_found"
          ? "This broker uses a different symbol. Open Data details and try another suffix or pick from your linked positions."
          : "Could not load candles from MetaApi. Try Sync from Accounts, or change timeframe.",
      symbolOptions,
      attemptedSymbols: resolution.attempted,
      account,
      accountChoices: cloudAccounts,
      lastCandleTime: null,
      source: "MetaApi MT5",
    };
  }
}
