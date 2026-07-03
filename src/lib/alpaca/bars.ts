import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";
import { getAlpacaPaperConfig } from "@/lib/alpaca/env";
import { getAlpacaBars } from "@/lib/alpaca/client";
import { toAlpacaSymbol } from "@/lib/alpaca/symbols";

function timeframeToAlpaca(tf: string): string | null {
  switch (tf.toLowerCase()) {
    case "m1":
      return "1Min";
    case "m5":
      return "5Min";
    case "m15":
      return "15Min";
    case "m30":
      return "30Min";
    case "h1":
      return "1Hour";
    case "h4":
      return "4Hour";
    case "d1":
      return "1Day";
    default:
      return null;
  }
}

function timeframeMs(tf: string): number {
  switch (tf.toLowerCase()) {
    case "m1":
      return 60_000;
    case "m5":
      return 5 * 60_000;
    case "m15":
      return 15 * 60_000;
    case "m30":
      return 30 * 60_000;
    case "h4":
      return 4 * 60 * 60_000;
    case "d1":
      return 24 * 60 * 60_000;
    case "h1":
    default:
      return 60 * 60_000;
  }
}

/** Fetch historical bars from Alpaca Market Data when credentials are configured. */
export async function fetchAlpacaCandles(
  symbol: string,
  timeframeKey: string,
  count = 500,
): Promise<MetaApiCandle[] | null> {
  const config = getAlpacaPaperConfig();
  const alpacaSymbol = toAlpacaSymbol(symbol);
  const alpacaTf = timeframeToAlpaca(timeframeKey);
  if (!config || !alpacaSymbol || !alpacaTf) return null;

  const end = new Date();
  const start = new Date(end.getTime() - count * timeframeMs(timeframeKey) * 1.15);

  try {
    const bars = await getAlpacaBars(config, alpacaSymbol, {
      timeframe: alpacaTf,
      start: start.toISOString(),
      end: end.toISOString(),
      limit: count,
      adjustment: "split",
    });

    return bars.map((bar) => ({
      time: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      tickVolume: bar.n ?? bar.v,
      volume: bar.v,
    }));
  } catch (error) {
    console.warn("[alpaca/bars] fetch failed", {
      symbol: alpacaSymbol,
      timeframeKey,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
