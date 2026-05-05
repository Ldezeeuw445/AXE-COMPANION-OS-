import type {
  ChartActionCandle,
  ChartActionCommand,
} from "@/lib/axeChartActions/chartActionTypes";

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

type SwingAnchor = {
  type: "high" | "low";
  index: number;
  time: number;
  price: number;
};

export function buildFibonacciActionFromCandles(input: {
  id: string;
  source: "axe" | "user";
  symbol: string;
  timeframe: string;
  accountId?: string;
  candles: ChartActionCandle[];
  lookback?: number;
  strength?: number;
}): ChartActionCommand {
  const pair = findRecentSwingPair(input.candles, {
    lookback: input.lookback,
    strength: input.strength,
  });
  const anchorA = pair.low.index <= pair.high.index ? pair.low : pair.high;
  const anchorB = pair.low.index <= pair.high.index ? pair.high : pair.low;
  const direction = anchorA.type === "low" && anchorB.type === "high" ? "up" : "down";
  const high = Math.max(anchorA.price, anchorB.price);
  const low = Math.min(anchorA.price, anchorB.price);
  const range = high - low;

  return {
    id: input.id,
    type: "draw_fibonacci",
    source: input.source,
    symbol: input.symbol,
    timeframe: input.timeframe,
    accountId: input.accountId,
    requiresUserAcceptance: false,
    payload: {
      points: [
        { time: anchorA.time, price: anchorA.price },
        { time: anchorB.time, price: anchorB.price },
      ],
      direction,
      levels: FIB_LEVELS.map((level) => ({
        level,
        price: Number((direction === "up" ? high - range * level : low + range * level).toFixed(8)),
      })),
      explanation:
        direction === "up"
          ? "AXE mapped Fibonacci over the latest confirmed swing up."
          : "AXE mapped Fibonacci over the latest confirmed swing down.",
    },
  };
}

export function findRecentSwingPair(
  candles: ChartActionCandle[],
  options: { lookback?: number; strength?: number; minSeparation?: number } = {},
): { low: SwingAnchor; high: SwingAnchor } {
  const strength = options.strength ?? 3;
  const minSeparation = options.minSeparation ?? strength + 1;
  const visible = normalizeCandles(candles).slice(-(options.lookback ?? 160));

  if (visible.length < strength * 2 + 2) {
    throw new Error("Not enough visible candles to detect a confirmed swing.");
  }

  const pivots: SwingAnchor[] = [];
  for (let index = strength; index < visible.length - strength; index += 1) {
    const candle = visible[index];
    const neighbors = [
      ...visible.slice(index - strength, index),
      ...visible.slice(index + 1, index + strength + 1),
    ];

    if (neighbors.every((other) => candle.high > other.high)) {
      pivots.push({ type: "high", index, time: candle.time, price: candle.high });
    }
    if (neighbors.every((other) => candle.low < other.low)) {
      pivots.push({ type: "low", index, time: candle.time, price: candle.low });
    }
  }

  for (let index = pivots.length - 1; index >= 0; index -= 1) {
    const latest = pivots[index];
    const previous = pivots
      .slice(0, index)
      .reverse()
      .find((pivot) => pivot.type !== latest.type && Math.abs(latest.index - pivot.index) >= minSeparation);

    if (previous) {
      return latest.type === "high"
        ? { low: previous, high: latest }
        : { low: latest, high: previous };
    }
  }

  return fallbackRange(visible);
}

function normalizeCandles(candles: ChartActionCandle[]) {
  return candles
    .map((candle) => ({
      time: normalizeTime(candle.time),
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
    }))
    .filter((candle) => candle.time != null)
    .filter((candle) => [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite))
    .sort((a, b) => Number(a.time) - Number(b.time)) as Array<{
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
    }>;
}

function fallbackRange(candles: ReturnType<typeof normalizeCandles>): { low: SwingAnchor; high: SwingAnchor } {
  let low: SwingAnchor = { type: "low", index: 0, time: candles[0].time, price: candles[0].low };
  let high: SwingAnchor = { type: "high", index: 0, time: candles[0].time, price: candles[0].high };
  candles.forEach((candle, index) => {
    if (candle.low < low.price) low = { type: "low", index, time: candle.time, price: candle.low };
    if (candle.high > high.price) high = { type: "high", index, time: candle.time, price: candle.high };
  });
  return { low, high };
}

function normalizeTime(time: string | number): number | null {
  if (typeof time === "number" && Number.isFinite(time)) {
    return time > 10_000_000_000 ? Math.floor(time / 1000) : time;
  }
  const ms = Date.parse(String(time));
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}
