import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listWatchlistItems } from "@/app/(app)/settings/actions";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import {
  clientGetHistoricalCandles,
  clientListSymbols,
  clientGetPositions,
  MetaApiRequestError,
  type MetaApiCandle,
} from "@/lib/mt5/metaApiClient";
import { metaApiTimeframeFromKey, normalizeChartTfKey } from "@/lib/broker/chartTimeframes";
import {
  DEMO_EXTERNAL_ID,
  ensureDemoAccount,
  generateDemoCandles,
  isDemoAccount,
} from "@/lib/broker/demoAccount";
import {
  candidateBrokerSymbols,
  cleanDisplaySymbol,
  displaySymbolAliases,
  resolveBrokerSymbol,
} from "@/lib/broker/symbolResolution";
import {
  buildBrokerSymbolRuntimeMetadata,
  CANONICAL_BROKER_SYMBOLS,
  getMetadataSymbolMap,
  getMetadataSymbolUniverse,
  metadataSymbolUniverseFresh,
  probeBrokerSymbolReport,
} from "@/lib/broker/brokerSymbolRuntime";
import type { OpenPositionRow } from "@/lib/broker/loadPositionsPageData";

const DEFAULT_SYMBOL = "XAUUSD";
const FALLBACK_SYMBOLS = [...CANONICAL_BROKER_SYMBOLS];
const POSITIONS_RENDER_BUDGET_MS = 12_000;
const SYMBOLS_RENDER_BUDGET_MS = 8_000;
const CANDLES_RENDER_BUDGET_MS = 12_000;
const CANDLES_CANDIDATE_BUDGET_MS = 4_500;
const CANDLE_CACHE_TTL_MS = 5 * 60 * 1000;
const SYMBOL_UNIVERSE_TTL_MS = 12 * 60 * 60 * 1000;

type CandleCacheEntry = {
  candles: MetaApiCandle[];
  brokerSymbol: string;
  savedAt: number;
  lastCandleTime: string | null;
};

const candleCache = new Map<string, CandleCacheEntry>();

class ChartDataTimeoutError extends Error {
  constructor(readonly operation: string) {
    super(`${operation}_timeout`);
    this.name = "ChartDataTimeoutError";
  }
}

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
  connectionMethod?: string | null;
  /** MetaApi region the cloud terminal lives in — needed to hit the right host. */
  metaApiRegion?: string | null;
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
  /** Keeps copy honest: either real broker data or AXE's built-in paper feed. */
  source: "MetaApi MT5" | "AXE Demo";
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

function isCleanDisplayCandidate(symbol: string): boolean {
  const s = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,12}$/.test(s)) return false;
  if (s.length < 3) return false;
  return true;
}

function chartSymbolSupported(displaySymbol: string, knownSymbols: string[], symbolMap: Record<string, string>): boolean {
  if (symbolMap[displaySymbol]) return true;
  if (knownSymbols.length === 0) return false;
  const resolved = resolveBrokerSymbol(displaySymbol, knownSymbols);
  return resolved.reason !== "fallback_request" && knownSymbols.includes(resolved.brokerSymbol);
}

function buildSymbolOptions(input: {
  requested: string;
  fallbackSymbols: string[];
  watchSymbols: string[];
  positionSymbols: string[];
  aliases: string[];
  knownSymbols: string[];
  symbolMap: Record<string, string>;
}): string[] {
  const raw = [
    input.requested,
    ...input.fallbackSymbols,
    ...input.watchSymbols,
    ...input.positionSymbols,
    ...input.aliases,
  ];
  const cleaned = raw.map(cleanDisplaySymbol).filter(Boolean);
  const out = new Set<string>();
  for (const symbol of cleaned) {
    if (!isCleanDisplayCandidate(symbol)) continue;
    if (!chartSymbolSupported(symbol, input.knownSymbols, input.symbolMap)) continue;
    out.add(symbol);
  }
  if (isCleanDisplayCandidate(input.requested)) out.add(input.requested);
  return Array.from(out).sort();
}

function safeDisplaySymbol(raw: string): string {
  const display = cleanDisplaySymbol(raw) || raw;
  return isCleanDisplayCandidate(display) ? display : DEFAULT_SYMBOL;
}

function chartCacheKey(accountId: string, brokerSymbol: string, timeframe: string): string {
  return `${accountId}|${brokerSymbol}|${timeframe}`;
}

function getCachedCandles(
  accountId: string,
  brokerSymbol: string,
  timeframe: string,
): CandleCacheEntry | null {
  const cached = candleCache.get(chartCacheKey(accountId, brokerSymbol, timeframe));
  if (!cached) return null;
  if (Date.now() - cached.savedAt > CANDLE_CACHE_TTL_MS) return null;
  return cached;
}

function rememberCandles(
  accountId: string,
  brokerSymbol: string,
  timeframe: string,
  candles: MetaApiCandle[],
) {
  if (candles.length === 0) return;
  candleCache.set(chartCacheKey(accountId, brokerSymbol, timeframe), {
    candles,
    brokerSymbol,
    savedAt: Date.now(),
    lastCandleTime: candles.at(-1)?.time ?? null,
  });
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

async function withRenderBudget<T>(
  operation: string,
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new ChartDataTimeoutError(operation)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isTimeoutError(e: unknown): e is ChartDataTimeoutError {
  return e instanceof ChartDataTimeoutError;
}

async function loadFirstCandles(input: {
  accountId: string;
  region: string | null;
  candidates: string[];
  timeframe: string;
  limit: number;
}): Promise<{ candles: MetaApiCandle[]; brokerSymbol: string; attempted: string[] }> {
  const attempted: string[] = [];
  let lastError: unknown = null;
  for (const candidate of input.candidates) {
    if (!candidate || attempted.includes(candidate)) continue;
    attempted.push(candidate);
    const cached = getCachedCandles(input.accountId, candidate, input.timeframe);
    if (cached) {
      return { candles: cached.candles, brokerSymbol: cached.brokerSymbol, attempted };
    }
    try {
      const candles = await withRenderBudget(
        `candles_${candidate}`,
        clientGetHistoricalCandles(input.accountId, candidate, input.timeframe, input.limit, input.region),
        CANDLES_CANDIDATE_BUDGET_MS,
      );
      if (candles.length > 0) {
        rememberCandles(input.accountId, candidate, input.timeframe, candles);
        return { candles, brokerSymbol: candidate, attempted };
      }
    } catch (e) {
      lastError = e;
      if (isTimeoutError(e)) break;
      if (!(e instanceof MetaApiRequestError && e.code === "not_found")) break;
    }
  }
  if (lastError) throw lastError;
  return { candles: [], brokerSymbol: input.candidates[0] ?? "", attempted };
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
      .select("id,label,provider,connection_method,external_connection_id,mt5_server,provider_status,metadata")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    listWatchlistItems(),
  ]);

  const rawAccounts: Array<{
    id: string;
    label: string | null;
    provider: string | null;
    connection_method: string | null;
    external_connection_id: string | null;
    mt5_server: string | null;
    provider_status: string | null;
    metadata: Record<string, unknown> | null;
  }> = [...((accountsRows ?? []) as Array<{
    id: string;
    label: string | null;
    provider: string | null;
    connection_method: string | null;
    external_connection_id: string | null;
    mt5_server: string | null;
    provider_status: string | null;
    metadata: Record<string, unknown> | null;
  }>)];
  const demo = await ensureDemoAccount(supabase, user.id);
  if (demo && !rawAccounts.some((a) => a.id === demo.id)) rawAccounts.unshift({
    id: demo.id,
    label: demo.label,
    provider: demo.provider,
    connection_method: demo.connection_method ?? null,
    external_connection_id: demo.external_connection_id ?? null,
    mt5_server: demo.mt5_server,
    provider_status: demo.provider_status ?? null,
    metadata: demo.metadata ?? null,
  });

  const accountChoices: AccountSummary[] = rawAccounts
    .filter(
      (r) =>
        isDemoAccount(r) ||
        (r.connection_method === "cloud_mt5" &&
          typeof r.external_connection_id === "string" &&
          r.external_connection_id.length > 0),
    )
    .map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const region = typeof meta.metaapiRegion === "string" ? meta.metaapiRegion : null;
      return {
        brokerAccountId: r.id as string,
        metaApiAccountId: isDemoAccount(r) ? DEMO_EXTERNAL_ID : (r.external_connection_id as string),
        label: (r.label as string) ?? (isDemoAccount(r) ? "AXE Demo Account" : "MT5 Account"),
        mt5Server: (r.mt5_server as string) ?? null,
        active: prefs?.active_account_id === r.id,
        connectionMethod: (r.connection_method as string) ?? null,
        metaApiRegion: region,
      };
    });

  const requestedAccountId = (accountParam ?? "").trim();
  const account =
    accountChoices.find((a) => a.brokerAccountId === requestedAccountId) ??
    accountChoices.find((a) => a.active) ??
    accountChoices[0] ??
    null;

  const watchSyms = watchlistRows.map((w) => w.symbol.trim().toUpperCase()).filter(Boolean);
  const isDemo = account?.connectionMethod === "demo_paper";

  if (isDemo && account) {
    const requestedRaw = normalizeSymbol(symbolParam) || watchSyms[0] || DEFAULT_SYMBOL;
    const requested = safeDisplaySymbol(requestedRaw);
    const candles = generateDemoCandles(requested, timeframeKey, 500);
    const last = candles.at(-1)?.close ?? null;
    const lastTime = candles.at(-1)?.time ?? null;
    return {
      symbol: requested,
      brokerSymbol: requested,
      timeframeKey,
      metaApiTimeframe,
      candles,
      positionsOnSymbol: [],
      positionsOnSymbolCount: 0,
      totalPositions: 0,
      lastPrice: last,
      providerStatus: "demo",
      failure: "ok",
      dataError: null,
      hint: "AXE Demo is a virtual paper account. No broker order is sent.",
      symbolOptions: Array.from(new Set([...FALLBACK_SYMBOLS, ...watchSyms.map(cleanDisplaySymbol).filter(Boolean)])).sort(),
      attemptedSymbols: [requested],
      account,
      accountChoices,
      lastCandleTime: lastTime,
      source: "AXE Demo",
    };
  }

  if (!getMetaApiToken()) {
    const requested = safeDisplaySymbol(normalizeSymbol(symbolParam) || DEFAULT_SYMBOL);
    const out = emptyData(
      timeframeKey,
      metaApiTimeframe,
      requested,
      "AXE MT5 Cloud is not configured on the server. Add the MetaAPI token to enable broker data.",
      "provider_not_configured",
      "provider_not_configured",
      "Chart data is not available because AXE MT5 Cloud is not configured for this deployment.",
    );
    out.symbolOptions = Array.from(new Set([...FALLBACK_SYMBOLS, ...watchSyms.map(cleanDisplaySymbol).filter(Boolean)])).sort();
    out.accountChoices = accountChoices;
    return out;
  }

  if (!account) {
    const requested = safeDisplaySymbol(normalizeSymbol(symbolParam) || DEFAULT_SYMBOL);
    const out = emptyData(
      timeframeKey,
      metaApiTimeframe,
      requested,
      "Connect a MetaApi MT5 cloud account to unlock the broker chart.",
      "account_not_connected",
      null,
      "No AXE MT5 Cloud account is connected yet.",
    );
    out.symbolOptions = Array.from(new Set([...FALLBACK_SYMBOLS, ...watchSyms.map(cleanDisplaySymbol).filter(Boolean)])).sort();
    out.accountChoices = accountChoices;
    return out;
  }

  let allPositions: OpenPositionRow[] = [];
  let positionsTimedOut = false;
  try {
    const raw = (await withRenderBudget(
      "positions",
      clientGetPositions(
        account.metaApiAccountId,
        true,
        account.metaApiRegion ?? null,
      ),
      POSITIONS_RENDER_BUDGET_MS,
    )) as Record<string, unknown>[];
    allPositions = mapPositions(raw);
  } catch (e) {
    positionsTimedOut = isTimeoutError(e);
    allPositions = [];
  }

  const fromPositions = allPositions.map((p) => p.symbol).filter(Boolean);
  const accountRaw = rawAccounts.find((r) => r.id === account.brokerAccountId);
  const accountMetadata = (accountRaw?.metadata ?? {}) as Record<string, unknown> & {
    symbol_map?: Record<string, string>;
  };
  let symbolMap = getMetadataSymbolMap(accountMetadata);
  const knownFromMetadata = Object.values(symbolMap).filter((s): s is string => typeof s === "string" && s.length > 0);
  const knownFromUniverse = getMetadataSymbolUniverse(accountMetadata);
  let discoveredSymbols: string[] = [];
  if (knownFromUniverse.length === 0 || !metadataSymbolUniverseFresh(accountMetadata, SYMBOL_UNIVERSE_TTL_MS)) {
    try {
      discoveredSymbols = await withRenderBudget(
        "symbols",
        clientListSymbols(account.metaApiAccountId, account.metaApiRegion ?? null),
        SYMBOLS_RENDER_BUDGET_MS,
      );
    } catch {
      discoveredSymbols = [];
    }
  }
  let knownAccountSymbols = Array.from(new Set([
    ...fromPositions,
    ...knownFromMetadata,
    ...knownFromUniverse,
    ...discoveredSymbols,
  ]));
  const requestedRaw = normalizeSymbol(symbolParam) || allPositions[0]?.symbol || watchSyms[0] || DEFAULT_SYMBOL;
  const requested = safeDisplaySymbol(requestedRaw);

  if (knownAccountSymbols.length > 0) {
    const runtimeMeta = buildBrokerSymbolRuntimeMetadata({
      existingMetadata: accountMetadata,
      knownSymbols: knownAccountSymbols,
      displaySymbols: [requested, ...watchSyms, ...fromPositions.map(cleanDisplaySymbol).filter(Boolean)],
    });
    symbolMap = runtimeMeta.symbol_map;
    knownAccountSymbols = Array.from(new Set([...knownAccountSymbols, ...Object.values(symbolMap)]));
    const nextMetadata = { ...accountMetadata, ...runtimeMeta };
    void supabase
      .from("user_broker_accounts")
      .update({ metadata: nextMetadata })
      .eq("id", account.brokerAccountId)
      .eq("user_id", user.id);
    void probeBrokerSymbolReport({
      accountId: account.metaApiAccountId,
      region: account.metaApiRegion ?? null,
      report: runtimeMeta.symbol_resolution_report,
      timeframe: metaApiTimeframe,
      displays: [requested, ...CANONICAL_BROKER_SYMBOLS],
      timeoutMs: 2_000,
    }).then((symbol_resolution_report) => {
      void supabase
        .from("user_broker_accounts")
        .update({
          metadata: {
            ...nextMetadata,
            symbol_resolution_report,
          },
        })
        .eq("id", account.brokerAccountId)
        .eq("user_id", user.id);
    });
  }

  const cachedBroker = symbolMap[requested] ?? symbolMap[requestedRaw];
  const resolution = cachedBroker
    ? {
        brokerSymbol: cachedBroker,
        displaySymbol: requested,
        exact: cachedBroker === requested,
        attempted: [requested, cachedBroker].filter((v, i, a) => a.indexOf(v) === i),
        reason: cachedBroker === requested ? ("exact_match" as const) : ("suffix_variant" as const),
      }
    : resolveBrokerSymbol(requested, knownAccountSymbols);

  if (
    knownAccountSymbols.length > 0 &&
    resolution.reason === "fallback_request" &&
    !knownAccountSymbols.includes(resolution.brokerSymbol)
  ) {
    const symbolOptions = buildSymbolOptions({
      requested,
      fallbackSymbols: FALLBACK_SYMBOLS,
      watchSymbols: watchSyms,
      positionSymbols: fromPositions.map(cleanDisplaySymbol).filter(Boolean),
      aliases: displaySymbolAliases(requested),
      knownSymbols: knownAccountSymbols,
      symbolMap,
    });
    return {
      symbol: requested,
      brokerSymbol: "",
      timeframeKey,
      metaApiTimeframe,
      candles: [],
      positionsOnSymbol: [],
      positionsOnSymbolCount: 0,
      totalPositions: allPositions.length,
      lastPrice: null,
      providerStatus: "failed",
      failure: "broker_symbol_not_found",
      dataError: `${requested} is not available on this broker account.`,
      hint: "AXE checked the active broker symbol list and could not resolve a valid MT5 symbol for this account.",
      symbolOptions,
      attemptedSymbols: resolution.attempted,
      account,
      accountChoices,
      lastCandleTime: null,
      source: "MetaApi MT5",
    };
  }

  const cleanPositionSymbols = fromPositions.map(cleanDisplaySymbol).filter(Boolean);
  const symbolOptions = buildSymbolOptions({
    requested,
    fallbackSymbols: FALLBACK_SYMBOLS,
    watchSymbols: watchSyms,
    positionSymbols: cleanPositionSymbols,
    aliases: displaySymbolAliases(requested),
    knownSymbols: knownAccountSymbols,
    symbolMap,
  });

  const positionsOnSymbol = allPositions
    .filter((p) => p.symbol === resolution.brokerSymbol || cleanDisplaySymbol(p.symbol) === requested)
    .map(toOverlay);

  const candleCandidates = Array.from(new Set([
    ...(cachedBroker ? [cachedBroker] : []),
    resolution.brokerSymbol,
    ...resolution.attempted,
    ...candidateBrokerSymbols(requested, knownAccountSymbols),
  ].filter(Boolean)));

  try {
    const loaded = await withRenderBudget(
      "candles",
      loadFirstCandles({
        accountId: account.metaApiAccountId,
        region: account.metaApiRegion ?? null,
        candidates: candleCandidates,
        timeframe: metaApiTimeframe,
        limit: 500,
      }),
      CANDLES_RENDER_BUDGET_MS,
    );
    const candles = loaded.candles;
    const brokerSymbol = loaded.brokerSymbol || resolution.brokerSymbol;
    const attemptedSymbols = Array.from(new Set([...resolution.attempted, ...loaded.attempted]));
    const last = candles.length > 0 ? candles[candles.length - 1]?.close ?? null : null;
    const lastTime = candles.length > 0 ? candles[candles.length - 1]?.time ?? null : null;

    if (candles.length === 0) {
      return {
        symbol: requested,
        brokerSymbol,
        timeframeKey,
        metaApiTimeframe,
        candles: [],
        positionsOnSymbol,
        positionsOnSymbolCount: positionsOnSymbol.length,
        totalPositions: allPositions.length,
        lastPrice: null,
        providerStatus: "stale",
        failure: "candles_unavailable",
        dataError: "MT5 market data not available for this symbol yet.",
        hint: "AXE Market Data could not return candles. Try Sync, another timeframe, or check the broker symbol in Data details.",
        symbolOptions,
        attemptedSymbols,
        account,
        accountChoices,
        lastCandleTime: null,
        source: "MetaApi MT5",
      };
    }

    return {
      symbol: requested,
      brokerSymbol,
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
      hint: positionsTimedOut
        ? "Chart candles loaded, but open positions are still refreshing. AXE will update overlays when the live feed catches up."
        : null,
      symbolOptions,
      attemptedSymbols,
      account,
      accountChoices,
      lastCandleTime: lastTime,
      source: "MetaApi MT5",
    };
  } catch (e) {
    if (isTimeoutError(e)) {
      const cached = candleCandidates
        .map((candidate) => getCachedCandles(account.metaApiAccountId, candidate, metaApiTimeframe))
        .find((entry): entry is CandleCacheEntry => Boolean(entry));
      if (cached) {
        return {
          symbol: requested,
          brokerSymbol: cached.brokerSymbol,
          timeframeKey,
          metaApiTimeframe,
          candles: cached.candles,
          positionsOnSymbol,
          positionsOnSymbolCount: positionsOnSymbol.length,
          totalPositions: allPositions.length,
          lastPrice: cached.candles.at(-1)?.close ?? null,
          providerStatus: "stale",
          failure: "ok",
          dataError: null,
          hint: "AXE is showing the last stable chart while market data refreshes.",
          symbolOptions,
          attemptedSymbols: resolution.attempted,
          account,
          accountChoices,
          lastCandleTime: cached.lastCandleTime,
          source: "MetaApi MT5",
        };
      }
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
        providerStatus: positionsTimedOut ? "stale" : "failed",
        failure: "market_data_unavailable",
        dataError: "MT5 market data is taking longer than expected.",
        hint: "AXE stopped waiting so the chart could render. The live stream and Sync can retry without freezing the screen.",
        symbolOptions,
        attemptedSymbols: resolution.attempted,
        account,
        accountChoices,
        lastCandleTime: null,
        source: "MetaApi MT5",
      };
    }
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
          ? "Symbol unsupported by the active broker account."
          : "MT5 market data not available for this symbol yet.",
      hint:
        failure === "broker_symbol_not_found"
          ? "This broker uses a different symbol. Open Data details and try another suffix or pick from your linked positions."
          : "Could not load candles from MetaApi. Try Sync from Accounts, or change timeframe.",
      symbolOptions,
      attemptedSymbols: resolution.attempted,
      account,
      accountChoices,
      lastCandleTime: null,
      source: "MetaApi MT5",
    };
  }
}
