import {
  clientGetHistoricalCandles,
  clientGetSymbolPrice,
  type MetaApiCandle,
  type MetaApiSymbolPrice,
} from "@/lib/mt5/metaApiClient";
import {
  candidateBrokerSymbols,
  cleanDisplaySymbol,
  detectSymbolPatterns,
  resolveBrokerSymbol,
} from "@/lib/broker/symbolResolution";

export const CANONICAL_BROKER_SYMBOLS = [
  "XAUUSD",
  "XAGUSD",
  "US30",
  "NAS100",
  "SPX500",
  "BTCUSD",
  "ETHUSD",
  "AUDUSD",
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AAPL",
  "JPM",
  "NVDA",
  "PLTR",
  "BRENT",
  "WTI",
  "TSLA",
] as const;

export type CanonicalBrokerSymbol = (typeof CANONICAL_BROKER_SYMBOLS)[number];

export type BrokerSymbolReportEntry = {
  displaySymbol: string;
  brokerSymbol: string | null;
  resolved: boolean;
  reason: string;
  candidatesTried: string[];
  hasCandles: boolean | null;
  hasCurrentPrice: boolean | null;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  priceTime: string | null;
  checkedAt: string;
};

export type BrokerSymbolRuntimeMetadata = {
  symbol_map: Record<string, string>;
  symbol_universe: {
    symbols: string[];
    updatedAt: string;
  };
  symbol_patterns: ReturnType<typeof detectSymbolPatterns>;
  symbol_resolution_report: Record<string, BrokerSymbolReportEntry>;
  symbol_map_updated_at: string;
};

function uniqueSymbols(symbols: string[]): string[] {
  return Array.from(new Set(symbols.map((s) => s.trim()).filter(Boolean)));
}

export function getMetadataSymbolMap(meta: Record<string, unknown> | null | undefined): Record<string, string> {
  const raw = meta?.symbol_map;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[cleanDisplaySymbol(k) || k.toUpperCase()] = v.trim();
  }
  return out;
}

export function getMetadataSymbolReport(
  meta: Record<string, unknown> | null | undefined,
): Record<string, BrokerSymbolReportEntry> {
  const raw = meta?.symbol_resolution_report;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, BrokerSymbolReportEntry>;
}

export function getMetadataSymbolUniverse(meta: Record<string, unknown> | null | undefined): string[] {
  const raw = meta?.symbol_universe;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const symbols = (raw as { symbols?: unknown }).symbols;
  return Array.isArray(symbols) ? symbols.filter((s): s is string => typeof s === "string" && s.length > 0) : [];
}

export function metadataSymbolUniverseFresh(
  meta: Record<string, unknown> | null | undefined,
  ttlMs: number,
): boolean {
  const raw = meta?.symbol_universe;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const updatedAt = (raw as { updatedAt?: unknown }).updatedAt;
  if (typeof updatedAt !== "string") return false;
  const t = Date.parse(updatedAt);
  return Number.isFinite(t) && Date.now() - t < ttlMs;
}

export function buildBrokerSymbolRuntimeMetadata(input: {
  existingMetadata?: Record<string, unknown> | null;
  knownSymbols: string[];
  displaySymbols?: string[];
  now?: string;
}): BrokerSymbolRuntimeMetadata {
  const now = input.now ?? new Date().toISOString();
  const existingMap = getMetadataSymbolMap(input.existingMetadata);
  const universe = uniqueSymbols(input.knownSymbols).slice(0, 1200);
  const displaySymbols = uniqueSymbols([
    ...CANONICAL_BROKER_SYMBOLS,
    ...(input.displaySymbols ?? []).map((s) => cleanDisplaySymbol(s) || s.toUpperCase()),
  ]);
  const map: Record<string, string> = { ...existingMap };
  const report: Record<string, BrokerSymbolReportEntry> = {
    ...getMetadataSymbolReport(input.existingMetadata),
  };

  for (const display of displaySymbols) {
    const cached = map[display];
    const resolution = cached
      ? {
          brokerSymbol: cached,
          attempted: candidateBrokerSymbols(display, universe),
          reason: universe.includes(cached) ? "cached_match" : "cached_not_in_universe",
        }
      : resolveBrokerSymbol(display, universe);
    const resolved =
      resolution.reason !== "fallback_request" &&
      Boolean(resolution.brokerSymbol) &&
      (universe.length === 0 || universe.includes(resolution.brokerSymbol));

    if (resolved) map[display] = resolution.brokerSymbol;
    else delete map[display];

    report[display] = {
      displaySymbol: display,
      brokerSymbol: resolved ? resolution.brokerSymbol : null,
      resolved,
      reason: resolved ? resolution.reason : universe.length > 0 ? "broker_symbol_not_found" : "symbol_universe_unavailable",
      candidatesTried: Array.from(new Set([
        display,
        ...(resolution.attempted ?? []),
        ...candidateBrokerSymbols(display, universe),
      ])).slice(0, 80),
      hasCandles: report[display]?.hasCandles ?? null,
      hasCurrentPrice: report[display]?.hasCurrentPrice ?? null,
      bid: report[display]?.bid ?? null,
      ask: report[display]?.ask ?? null,
      spread: report[display]?.spread ?? null,
      priceTime: report[display]?.priceTime ?? null,
      checkedAt: now,
    };
  }

  // Final pass: evict any remaining symbol_map entries whose broker symbol
  // is no longer in the current universe (handles symbols not in displaySymbols).
  if (universe.length > 0) {
    for (const [display, broker] of Object.entries(map)) {
      if (!universe.includes(broker)) {
        delete map[display];
      }
    }
  }

  return {
    symbol_map: map,
    symbol_universe: { symbols: universe, updatedAt: now },
    symbol_patterns: detectSymbolPatterns(universe),
    symbol_resolution_report: report,
    symbol_map_updated_at: now,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("symbol_probe_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function candlesOk(candles: MetaApiCandle[]): boolean {
  return Array.isArray(candles) && candles.length > 0;
}

function priceOk(price: MetaApiSymbolPrice): boolean {
  return price.bid != null || price.ask != null;
}

export async function probeBrokerSymbolReport(input: {
  accountId: string;
  region: string | null;
  report: Record<string, BrokerSymbolReportEntry>;
  timeframe: string;
  displays?: string[];
  timeoutMs?: number;
}): Promise<Record<string, BrokerSymbolReportEntry>> {
  const timeoutMs = input.timeoutMs ?? 2_500;
  const displays = input.displays ?? Object.keys(input.report);
  const next: Record<string, BrokerSymbolReportEntry> = { ...input.report };

  await Promise.all(
    displays.slice(0, 24).map(async (display) => {
      const entry = next[display];
      if (!entry?.brokerSymbol) return;
      const checkedAt = new Date().toISOString();
      const [price, candles] = await Promise.allSettled([
        withTimeout(clientGetSymbolPrice(input.accountId, entry.brokerSymbol, input.region), timeoutMs),
        withTimeout(clientGetHistoricalCandles(input.accountId, entry.brokerSymbol, input.timeframe, 2, input.region), timeoutMs),
      ]);
      const priceValue = price.status === "fulfilled" ? price.value : null;
      const bid = priceValue?.bid ?? null;
      const ask = priceValue?.ask ?? null;
      next[display] = {
        ...entry,
        hasCurrentPrice: priceValue ? priceOk(priceValue) : false,
        hasCandles: candles.status === "fulfilled" ? candlesOk(candles.value) : false,
        bid,
        ask,
        spread: bid != null && ask != null ? Math.abs(ask - bid) : null,
        priceTime: priceValue?.time ?? priceValue?.brokerTime ?? null,
        checkedAt,
      };
    }),
  );

  return next;
}

