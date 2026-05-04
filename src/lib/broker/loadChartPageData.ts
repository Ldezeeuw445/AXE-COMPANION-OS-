import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listWatchlistItems } from "@/app/(app)/settings/actions";
import { getActiveMetaApiCloudAccount } from "@/lib/mt5/activeCloudAccount";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import {
  clientGetHistoricalCandles,
  clientGetPositions,
  MetaApiRequestError,
  type MetaApiCandle,
} from "@/lib/mt5/metaApiClient";
import { metaApiTimeframeFromKey, normalizeChartTfKey } from "@/lib/broker/chartTimeframes";
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
};

export type ChartPageData = {
  symbol: string;
  timeframeKey: string;
  metaApiTimeframe: string;
  candles: MetaApiCandle[];
  positionsOnSymbol: ChartOverlayRow[];
  lastPrice: number | null;
  providerStatus: string | null;
  dataError: string | null;
  hint: string | null;
  symbolOptions: string[];
};

function mapSide(t: string | undefined): string {
  const u = (t ?? "").toUpperCase();
  if (u.includes("BUY")) return "buy";
  if (u.includes("SELL")) return "sell";
  return (t ?? "").toLowerCase();
}

function normalizeSymbol(raw: string | undefined): string {
  const s = (raw ?? "").trim().toUpperCase().replace(/[^A-Z0-9._]/g, "");
  return s || DEFAULT_SYMBOL;
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
  };
}

export async function loadChartPageData(
  symbolParam: string | undefined,
  tfParam: string | undefined,
): Promise<ChartPageData> {
  const timeframeKey = normalizeChartTfKey(tfParam);
  const metaApiTimeframe = metaApiTimeframeFromKey(timeframeKey);

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      symbol: DEFAULT_SYMBOL,
      timeframeKey,
      metaApiTimeframe,
      candles: [],
      positionsOnSymbol: [],
      lastPrice: null,
      providerStatus: null,
      dataError: null,
      hint: "Supabase is not configured.",
      symbolOptions: [...FALLBACK_SYMBOLS],
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      symbol: DEFAULT_SYMBOL,
      timeframeKey,
      metaApiTimeframe,
      candles: [],
      positionsOnSymbol: [],
      lastPrice: null,
      providerStatus: null,
      dataError: null,
      hint: "Sign in to load your MT5 chart.",
      symbolOptions: [...FALLBACK_SYMBOLS],
    };
  }

  const [watchlistRows, cloud] = await Promise.all([
    listWatchlistItems(),
    getActiveMetaApiCloudAccount(supabase, user.id),
  ]);

  const watchSyms = watchlistRows.map((w) => w.symbol.trim().toUpperCase()).filter(Boolean);

  let allPositions: OpenPositionRow[] = [];
  if (getMetaApiToken() && cloud) {
    try {
      const raw = (await clientGetPositions(cloud.metaApiAccountId, true)) as Record<string, unknown>[];
      allPositions = mapPositions(raw);
    } catch {
      allPositions = [];
    }
  }

  const fromPositions = allPositions.map((p) => p.symbol).filter(Boolean);
  const rawParam = symbolParam?.trim();
  const requested = rawParam ? normalizeSymbol(rawParam) : null;

  const symbolSet = new Set<string>([...FALLBACK_SYMBOLS, ...watchSyms, ...fromPositions]);
  if (requested) symbolSet.add(requested);
  const symbolOptions = [...symbolSet].sort();

  const symbol =
    requested ??
    allPositions[0]?.symbol ??
    (watchSyms[0] ? watchSyms[0] : null) ??
    DEFAULT_SYMBOL;

  const positionsOnSymbol = allPositions.filter((p) => p.symbol === symbol).map(toOverlay);

  if (!getMetaApiToken() || !cloud) {
    return {
      symbol,
      timeframeKey,
      metaApiTimeframe,
      candles: [],
      positionsOnSymbol,
      lastPrice: null,
      providerStatus: getMetaApiToken() ? null : "provider_not_configured",
      dataError: null,
      hint: "Connect a MetaApi MT5 cloud account on Accounts, set it active, then Sync to load broker candles.",
      symbolOptions,
    };
  }

  try {
    const candles = await clientGetHistoricalCandles(
      cloud.metaApiAccountId,
      symbol,
      metaApiTimeframe,
      500,
    );
    const last = candles.length > 0 ? candles[candles.length - 1]?.close ?? null : null;
    return {
      symbol,
      timeframeKey,
      metaApiTimeframe,
      candles,
      positionsOnSymbol,
      lastPrice: last != null && !Number.isNaN(last) ? last : null,
      providerStatus: "connected",
      dataError: null,
      hint: candles.length === 0 ? "No candles returned for this symbol/timeframe yet." : null,
      symbolOptions,
    };
  } catch (e) {
    const isMeta = e instanceof MetaApiRequestError;
    return {
      symbol,
      timeframeKey,
      metaApiTimeframe,
      candles: [],
      positionsOnSymbol,
      lastPrice: null,
      providerStatus: "failed",
      dataError: "MT5 market data not available for this symbol yet.",
      hint: isMeta
        ? "MetaApi could not return historical candles for this broker symbol. Try another symbol or timeframe after Sync."
        : "Could not load candles. Check MetaApi market-data host (METAAPI_MARKET_DATA_URL) and account region.",
      symbolOptions,
    };
  }
}
