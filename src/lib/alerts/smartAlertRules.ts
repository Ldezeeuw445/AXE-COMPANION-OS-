import type { NewsItem } from "@/lib/market/marketTypes";
import {
  atrSeries,
  bollingerBands,
  type IndicatorMathCandle,
  macdSeries,
  rsiSeries,
} from "@/lib/chart/indicatorMath";

export type OpenPosition = {
  symbol: string;
  type: string | null;
  stop_loss?: number | null;
};

export type SentimentEval = {
  fire: boolean;
  message: string;
  avgSentiment: number;
  headlineCount: number;
};

export type CorrelationEval = {
  fire: boolean;
  message: string;
  cluster: string | null;
  count: number;
};

export type ContextEval = {
  fire: boolean;
  message: string;
};

export type ConfluenceEval = {
  fire: boolean;
  message: string;
  bias: "bullish" | "bearish" | null;
};

export type PredictiveEval = {
  fire: boolean;
  message: string;
};

function normalizeSide(type: string | null | undefined): "long" | "short" | "unknown" {
  const raw = String(type ?? "").toLowerCase();
  if (raw.includes("buy") || raw.includes("long")) return "long";
  if (raw.includes("sell") || raw.includes("short")) return "short";
  return "unknown";
}

/** Group symbols into coarse correlation buckets (FX quote currency, USD equities, metals). */
export function symbolCorrelationCluster(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^(XAU|XAG|GOLD|SILVER)/.test(s) || s.startsWith("XAU") || s.startsWith("XAG")) return "metals";
  if (s.endsWith("JPY") || s.startsWith("JPY")) return "fx:jpy";
  if (s.endsWith("USD") || s.startsWith("USD")) return "fx:usd";
  if (s.endsWith("EUR") || s.startsWith("EUR")) return "fx:eur";
  if (/^[A-Z]{1,5}$/.test(s)) return `eq:${s}`;
  return `other:${s.slice(0, 4)}`;
}

export function evaluateSentimentShift(
  news: NewsItem[],
  watchlist: string[],
  opts?: { minHeadlines?: number; threshold?: number },
): SentimentEval {
  const minHeadlines = opts?.minHeadlines ?? 3;
  const threshold = opts?.threshold ?? 0.35;
  const watch = new Set(watchlist.map((s) => s.toUpperCase()));
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;

  const relevant = news.filter((n) => {
    const ts = Date.parse(n.publishedAt);
    if (!Number.isFinite(ts) || ts < twoHoursAgo) return false;
    if (n.sentiment == null) return false;
    if (watch.size === 0) return true;
    const syms = (n.symbols ?? []).map((s) => s.toUpperCase());
    return syms.some((s) => watch.has(s)) || syms.length === 0;
  });

  const scored = relevant.filter((n) => n.sentiment != null);
  if (scored.length < minHeadlines) {
    return { fire: false, message: "", avgSentiment: 0, headlineCount: scored.length };
  }

  const avg = scored.reduce((sum, n) => sum + (n.sentiment ?? 0), 0) / scored.length;
  if (avg >= threshold) {
    return {
      fire: true,
      message: `Bullish sentiment shift on watchlist (+${Math.round(avg * 100)} pts, ${scored.length} headlines in 2h).`,
      avgSentiment: avg,
      headlineCount: scored.length,
    };
  }
  if (avg <= -threshold) {
    return {
      fire: true,
      message: `Bearish sentiment shift on watchlist (${Math.round(avg * 100)} pts, ${scored.length} headlines in 2h).`,
      avgSentiment: avg,
      headlineCount: scored.length,
    };
  }
  return { fire: false, message: "", avgSentiment: avg, headlineCount: scored.length };
}

export function evaluateCorrelationCluster(
  positions: OpenPosition[],
  minClusterSize = 3,
): CorrelationEval {
  if (positions.length < minClusterSize) {
    return { fire: false, message: "", cluster: null, count: 0 };
  }
  const buckets = new Map<string, string[]>();
  for (const p of positions) {
    const sym = String(p.symbol ?? "").toUpperCase();
    if (!sym) continue;
    const cluster = symbolCorrelationCluster(sym);
    const list = buckets.get(cluster) ?? [];
    list.push(sym);
    buckets.set(cluster, list);
  }
  let bestCluster: string | null = null;
  let bestCount = 0;
  let bestSyms: string[] = [];
  for (const [cluster, syms] of buckets) {
    if (syms.length > bestCount) {
      bestCount = syms.length;
      bestCluster = cluster;
      bestSyms = syms;
    }
  }
  if (bestCount < minClusterSize || !bestCluster) {
    return { fire: false, message: "", cluster: null, count: bestCount };
  }
  const pct = Math.round((bestCount / positions.length) * 100);
  return {
    fire: true,
    message: `${bestCount} positions cluster in ${bestCluster.replace(":", " ")} (~${pct}% of book: ${[...new Set(bestSyms)].slice(0, 4).join(", ")}). Consider diversifying.`,
    cluster: bestCluster,
    count: bestCount,
  };
}

export function evaluateContextAwareExposure(
  positions: OpenPosition[],
  newsSentiment: number,
  minSameSide = 3,
): ContextEval {
  if (positions.length < minSameSide) return { fire: false, message: "" };
  let longs = 0;
  let shorts = 0;
  for (const p of positions) {
    const side = normalizeSide(p.type);
    if (side === "long") longs += 1;
    else if (side === "short") shorts += 1;
  }
  if (longs >= minSameSide && newsSentiment <= -0.2) {
    return {
      fire: true,
      message: `You are ${longs}× long but watchlist sentiment turned bearish — concentration risk vs headlines.`,
    };
  }
  if (shorts >= minSameSide && newsSentiment >= 0.2) {
    return {
      fire: true,
      message: `You are ${shorts}× short but watchlist sentiment turned bullish — book bias conflicts with flow.`,
    };
  }
  return { fire: false, message: "" };
}

function toMathCandles(candles: Array<{ time: string | number; open: number; high: number; low: number; close: number; tickVolume?: number | null; volume?: number | null }>): IndicatorMathCandle[] {
  return candles.map((c) => ({
    time: typeof c.time === "number" ? c.time : Math.floor(Date.parse(String(c.time)) / 1000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    tickVolume: c.tickVolume ?? c.volume ?? null,
    volume: c.volume ?? null,
  }));
}

export function evaluateTechnicalConfluence(candles: IndicatorMathCandle[]): ConfluenceEval {
  if (candles.length < 40) return { fire: false, message: "", bias: null };
  const closes = candles.map((c) => c.close);
  const rsi = rsiSeries(closes, 14);
  const macd = macdSeries(closes);
  const bb = bollingerBands(closes, 20, 2);
  const i = closes.length - 1;
  const prev = closes.length - 2;
  const r = rsi[i];
  const rPrev = rsi[prev];
  const hist = macd[i]?.histogram;
  const histPrev = macd[prev]?.histogram;
  const close = closes[i];
  const lower = bb[i]?.lower;
  const upper = bb[i]?.upper;

  if (
    r != null &&
    rPrev != null &&
    r < 38 &&
    hist != null &&
    histPrev != null &&
    hist > histPrev &&
    lower != null &&
    close <= lower * 1.002
  ) {
    return {
      fire: true,
      bias: "bullish",
      message: "RSI + MACD + Bollinger confluence — oversold bounce setup with low false-signal score.",
    };
  }
  if (
    r != null &&
    rPrev != null &&
    r > 62 &&
    hist != null &&
    histPrev != null &&
    hist < histPrev &&
    upper != null &&
    close >= upper * 0.998
  ) {
    return {
      fire: true,
      bias: "bearish",
      message: "RSI + MACD + Bollinger confluence — overbought fade setup with low false-signal score.",
    };
  }
  return { fire: false, message: "", bias: null };
}

export function evaluatePredictiveLevelBreak(candles: IndicatorMathCandle[], symbol: string): PredictiveEval {
  if (candles.length < 30) return { fire: false, message: "" };
  const math = candles;
  const slice = math.slice(-24);
  const high = Math.max(...slice.map((c) => c.high));
  const low = Math.min(...slice.map((c) => c.low));
  const close = math.at(-1)?.close ?? null;
  if (close == null || !Number.isFinite(close)) return { fire: false, message: "" };
  const atr = atrSeries(math, 14).at(-1) ?? 0;
  const nearHigh = high - close <= atr * 0.5;
  const nearLow = close - low <= atr * 0.5;
  const rising = (math.at(-1)?.close ?? 0) > (math.at(-2)?.close ?? 0) && (math.at(-2)?.close ?? 0) > (math.at(-3)?.close ?? 0);
  const falling = (math.at(-1)?.close ?? 0) < (math.at(-2)?.close ?? 0) && (math.at(-2)?.close ?? 0) < (math.at(-3)?.close ?? 0);

  if (nearHigh && rising) {
    return {
      fire: true,
      message: `${symbol} within ATR band of 24h high (${high.toFixed(2)}) — breakout probability elevated.`,
    };
  }
  if (nearLow && falling) {
    return {
      fire: true,
      message: `${symbol} within ATR band of 24h low (${low.toFixed(2)}) — breakdown probability elevated.`,
    };
  }
  return { fire: false, message: "" };
}

export function candlesFromMetaApi(
  raw: Array<{ time?: string | number; open: number; high: number; low: number; close: number; tickVolume?: number | null; volume?: number | null }>,
): IndicatorMathCandle[] {
  return toMathCandles(raw);
}
