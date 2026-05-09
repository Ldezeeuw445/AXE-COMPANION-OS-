import type {
  ChartActionCandle,
  ChartActionCommand,
} from "@/lib/axeChartActions/chartActionTypes";

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

/** URL-key → seconds-per-bar so we can aggregate higher timeframes. */
const TF_SECONDS: Record<string, number> = {
  m1: 60,
  m5: 300,
  m15: 900,
  m30: 1800,
  h1: 3600,
  h4: 14400,
  d1: 86400,
};

type SwingAnchor = {
  type: "high" | "low";
  index: number;
  time: number;
  price: number;
};

type NormCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

/**
 * Source the auto-Fib anchors from. The picker in the chart toolbar
 * exposes these — `auto` is the default and matches the historic
 * behaviour, `swing` forces market-structure swings (HH/HL or LH/LL),
 * `pd` uses yesterday's day-range (PDH ↔ PDL).
 */
export type FibSourceMode = "auto" | "swing" | "pd";

export function buildFibonacciActionFromCandles(input: {
  id: string;
  source: "axe" | "user";
  symbol: string;
  timeframe: string;
  accountId?: string;
  candles: ChartActionCandle[];
  lookback?: number;
  strength?: number;
  /** Default `auto`. */
  mode?: FibSourceMode;
}): ChartActionCommand {
  const mode: FibSourceMode = input.mode ?? "auto";

  // Pick anchor points based on mode:
  //   auto  → most recent confirmed trend leg on the active TF (HH/HL or LH/LL)
  //   swing → same as auto today (kept distinct so the UI label is clear and
  //           future iterations can diverge if needed)
  //   pd    → previous day's high & low; direction = up if PDH > PDL after
  //           PDL (price ramped) else down. Lets traders fib the daily range.
  let anchorA: SwingAnchor;
  let anchorB: SwingAnchor;
  let direction: "up" | "down";
  let explanation: string;

  if (mode === "pd") {
    const pd = findPreviousDayRange(input.candles);
    direction = pd.direction;
    anchorA = direction === "up" ? pd.high : pd.low;
    anchorB = direction === "up" ? pd.low : pd.high;
    explanation =
      direction === "up"
        ? "AXE mapped Fibonacci across yesterday's range (PDL → PDH)."
        : "AXE mapped Fibonacci across yesterday's range (PDH → PDL).";
  } else {
    // auto + swing share the same detection — both honour market structure
    const trend = findLatestTrendLegOnActiveTf(input.candles, {
      lookback: input.lookback,
      strength: input.strength,
    });
    direction = trend.direction;
    anchorA = direction === "up" ? trend.swing : trend.retrace; // 0%
    anchorB = direction === "up" ? trend.retrace : trend.swing; // 100%
    explanation =
      direction === "up"
        ? "AXE mapped Fibonacci over the latest HL → HH leg."
        : "AXE mapped Fibonacci over the latest LH → LL leg.";
  }

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
      // The annotation layer reads these so the lines/labels project past
      // the last candle (matches MT5's "right ray" behaviour) — handy for
      // seeing exactly when price will hit each retracement.
      settings: { extendRight: true, source: input.source, mode },
      levels: FIB_LEVELS.map((level) => ({
        level,
        price: Number((direction === "up" ? high - range * level : low + range * level).toFixed(8)),
      })),
      explanation,
    },
  };
}

export function buildTrendlineActionFromCandles(input: {
  id: string;
  source: "axe" | "user";
  symbol: string;
  timeframe: string;
  accountId?: string;
  candles: ChartActionCandle[];
  lookback?: number;
  strength?: number;
}): ChartActionCommand {
  // We aggregate the active-TF candles up to a higher timeframe before
  // detecting swings. The user wants the line to reflect the dominant
  // trend "from the 4H/D1 candles", not noise from M5/M15. Daily gives us
  // the cleanest line; if we don't have enough D1 candles in the loaded
  // window we drop down to H4. The line then renders across every
  // timeframe (extendRight), so a trader switching from D1 → H1 keeps the
  // same trendline projected forward.
  const trend = findHigherTfTrendline(input.candles, input.timeframe, {
    lookback: input.lookback,
    strength: input.strength,
  });

  return {
    id: input.id,
    type: "draw_trendline",
    source: input.source,
    symbol: input.symbol,
    timeframe: input.timeframe,
    accountId: input.accountId,
    requiresUserAcceptance: false,
    payload: {
      points: [
        { time: trend.earlier.time, price: trend.earlier.price },
        { time: trend.later.time, price: trend.later.price },
      ],
      direction: trend.direction,
      // Render the line all the way to the right edge of the chart.
      // The annotation layer reads `extendRight` from settings.
      settings: { extendRight: true, source: input.source, sourceTimeframe: trend.sourceTf },
      explanation:
        trend.direction === "up"
          ? `AXE drew a rising ${trend.sourceTf.toUpperCase()} trendline through the two most recent swing lows.`
          : `AXE drew a falling ${trend.sourceTf.toUpperCase()} trendline through the two most recent swing highs.`,
    },
  };
}

/**
 * Bucket candles into windows of `targetSeconds` and emit OHLC bars per
 * bucket. Used to look at 4H or D1 swings while the chart is rendering an
 * intraday timeframe.
 */
function aggregateToHigherTf(candles: NormCandle[], targetSeconds: number): NormCandle[] {
  if (candles.length === 0 || targetSeconds <= 0) return [];
  const buckets = new Map<number, NormCandle[]>();
  for (const candle of candles) {
    const bucketStart = Math.floor(candle.time / targetSeconds) * targetSeconds;
    const arr = buckets.get(bucketStart);
    if (arr) arr.push(candle);
    else buckets.set(bucketStart, [candle]);
  }
  const keys = Array.from(buckets.keys()).sort((a, b) => a - b);
  return keys.map((key) => {
    const group = buckets.get(key)!;
    const sorted = [...group].sort((a, b) => a.time - b.time);
    return {
      time: key,
      open: sorted[0].open,
      high: Math.max(...sorted.map((c) => c.high)),
      low: Math.min(...sorted.map((c) => c.low)),
      close: sorted[sorted.length - 1].close,
    };
  });
}

/**
 * Trendline detection that promotes to a higher timeframe before scanning
 * for swings. Tries D1 first, then H4, then falls back to the active TF
 * with same-type swing detection (rising lows or falling highs).
 */
function findHigherTfTrendline(
  candles: ChartActionCandle[],
  activeTimeframe: string,
  options: { lookback?: number; strength?: number } = {},
): { earlier: SwingAnchor; later: SwingAnchor; direction: "up" | "down"; sourceTf: string } {
  const normalized = normalizeCandles(candles);
  const activeSec = TF_SECONDS[activeTimeframe.toLowerCase()] ?? 3600;

  // Try a couple of higher timeframes in order — accept the first one that
  // gives us a usable same-type swing pair. The minimum viable size is 12
  // bars; below that swings can't be detected reliably.
  const ladder: Array<{ key: string; seconds: number }> = [];
  if (activeSec < TF_SECONDS.d1) ladder.push({ key: "d1", seconds: TF_SECONDS.d1 });
  if (activeSec < TF_SECONDS.h4) ladder.push({ key: "h4", seconds: TF_SECONDS.h4 });
  ladder.push({ key: activeTimeframe.toLowerCase(), seconds: activeSec });

  for (const step of ladder) {
    const series = step.seconds === activeSec
      ? normalized
      : aggregateToHigherTf(normalized, step.seconds);
    if (series.length < 12) continue;
    const pair = pickSameTypePair(series, options.strength ?? 3);
    if (pair) return { ...pair, sourceTf: step.key };
  }

  // Final fallback: synthesise a line from absolute extremes so the user at
  // least sees something meaningful instead of an error toast.
  const fallback = fallbackRangeFromNorm(normalized);
  const earlier: SwingAnchor =
    fallback.low.index <= fallback.high.index ? fallback.low : fallback.high;
  const later: SwingAnchor =
    fallback.low.index <= fallback.high.index ? fallback.high : fallback.low;
  return {
    earlier,
    later,
    direction: earlier.type === "low" ? "up" : "down",
    sourceTf: activeTimeframe,
  };
}

/**
 * On a (possibly aggregated) candle series, find the most recent pair of
 * same-type swings that visually represents the trend. Prefers ascending
 * lows (uptrend) or descending highs (downtrend); falls back to the
 * earliest→latest same-type pair if no clean monotonic pair exists.
 */
function pickSameTypePair(
  series: NormCandle[],
  strength: number,
): { earlier: SwingAnchor; later: SwingAnchor; direction: "up" | "down" } | null {
  if (series.length < strength * 2 + 4) return null;

  const pivots: SwingAnchor[] = [];
  for (let index = strength; index < series.length - strength; index += 1) {
    const candle = series[index];
    const neighbors = [
      ...series.slice(index - strength, index),
      ...series.slice(index + 1, index + strength + 1),
    ];
    if (neighbors.every((other) => candle.high > other.high)) {
      pivots.push({ type: "high", index, time: candle.time, price: candle.high });
    }
    if (neighbors.every((other) => candle.low < other.low)) {
      pivots.push({ type: "low", index, time: candle.time, price: candle.low });
    }
  }

  const lows = pivots.filter((p) => p.type === "low");
  const highs = pivots.filter((p) => p.type === "high");

  const lastLow = lows.at(-1);
  const prevLow = lows.length >= 2 ? lows[lows.length - 2] : null;
  const lastHigh = highs.at(-1);
  const prevHigh = highs.length >= 2 ? highs[highs.length - 2] : null;

  const upPair =
    prevLow && lastLow && lastLow.price > prevLow.price && lastLow.index > prevLow.index
      ? { earlier: prevLow, later: lastLow, direction: "up" as const }
      : null;
  const downPair =
    prevHigh && lastHigh && lastHigh.price < prevHigh.price && lastHigh.index > prevHigh.index
      ? { earlier: prevHigh, later: lastHigh, direction: "down" as const }
      : null;

  if (upPair && downPair) {
    return upPair.later.index >= downPair.later.index ? upPair : downPair;
  }
  if (upPair) return upPair;
  if (downPair) return downPair;

  if (lows.length >= 2) return { earlier: lows[0], later: lows.at(-1)!, direction: "up" as const };
  if (highs.length >= 2) return { earlier: highs[0], later: highs.at(-1)!, direction: "down" as const };

  return null;
}

/**
 * Find the latest "trend leg" on the active timeframe. We look at the last
 * two same-type swings: if the last two highs are ascending we're in an
 * uptrend → leg = HL → HH; if descending → downtrend → leg = LH → LL.
 * The retracement is anchored on the opposite-type swing immediately
 * preceding the dominant swing.
 */
export function findLatestTrendLegOnActiveTf(
  candles: ChartActionCandle[],
  options: { lookback?: number; strength?: number } = {},
): { swing: SwingAnchor; retrace: SwingAnchor; direction: "up" | "down" } {
  const strength = options.strength ?? 3;
  const visible = normalizeCandles(candles).slice(-(options.lookback ?? 220));
  if (visible.length < strength * 2 + 4) {
    throw new Error("Not enough candles to detect a trend leg.");
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

  const highs = pivots.filter((p) => p.type === "high");
  const lows = pivots.filter((p) => p.type === "low");

  const lastHigh = highs.at(-1);
  const prevHigh = highs.length >= 2 ? highs[highs.length - 2] : null;
  const lastLow = lows.at(-1);
  const prevLow = lows.length >= 2 ? lows[lows.length - 2] : null;

  // Decide direction by which "structure leg" is most recent. If the latest
  // pivot is a high AND that high is greater than the previous high → HH
  // confirmed → uptrend. If latest pivot is a low AND lower than previous low
  // → LL confirmed → downtrend.
  const latestPivot = pivots.at(-1);

  const upTrend =
    lastHigh && prevHigh && lastHigh.price > prevHigh.price && latestPivot?.type === "high";
  const downTrend =
    lastLow && prevLow && lastLow.price < prevLow.price && latestPivot?.type === "low";

  if (upTrend && lastHigh) {
    // HL = the most recent low between prevHigh and lastHigh.
    const hl = lows
      .filter((l) => prevHigh && l.index > prevHigh.index && l.index < lastHigh.index)
      .at(-1) ?? lows.at(-2) ?? lows.at(-1);
    if (hl) return { swing: lastHigh, retrace: hl, direction: "up" };
  }

  if (downTrend && lastLow) {
    const lh = highs
      .filter((h) => prevLow && h.index > prevLow.index && h.index < lastLow.index)
      .at(-1) ?? highs.at(-2) ?? highs.at(-1);
    if (lh) return { swing: lastLow, retrace: lh, direction: "down" };
  }

  // Fallback: when neither HH nor LL pattern is fresh, fall back to the
  // most recent confirmed leg (high → low or low → high) by alternating
  // pivots from the tail.
  for (let i = pivots.length - 1; i >= 1; i -= 1) {
    const a = pivots[i - 1];
    const b = pivots[i];
    if (a.type === b.type) continue;
    if (b.type === "high") return { swing: b, retrace: a, direction: "up" };
    return { swing: b, retrace: a, direction: "down" };
  }

  // Absolute extremes fallback.
  const fallback = fallbackRangeFromNorm(visible);
  const isUp = fallback.high.index >= fallback.low.index;
  return isUp
    ? { swing: fallback.high, retrace: fallback.low, direction: "up" }
    : { swing: fallback.low, retrace: fallback.high, direction: "down" };
}

/**
 * Backwards-compat helper used by older callers. Returns one low + one high
 * (most recent confirmed pair).
 */
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

  const fallback = fallbackRangeFromNorm(visible);
  return { low: fallback.low, high: fallback.high };
}

/** Older callers reach for this name — kept as a thin alias. */
export function findRecentSameTypeSwingPair(
  candles: ChartActionCandle[],
  options: { lookback?: number; strength?: number } = {},
): { earlier: SwingAnchor; later: SwingAnchor; direction: "up" | "down" } {
  const result = findHigherTfTrendline(candles, "h1", options);
  return { earlier: result.earlier, later: result.later, direction: result.direction };
}

/**
 * Compute yesterday's day-range from intraday candles. Buckets candles by
 * UTC date, picks the bucket immediately before the most recent one, and
 * returns the high & low (with their candle times). Direction is "up" if
 * the day made its high after the low (price climbed), "down" otherwise.
 *
 * Used by the Fib `pd` source mode so the user can fib yesterday's range
 * without dragging.
 */
function findPreviousDayRange(
  candles: ChartActionCandle[],
): { high: SwingAnchor; low: SwingAnchor; direction: "up" | "down" } {
  const normalized = normalizeCandles(candles);
  if (normalized.length === 0) {
    throw new Error("No candles to compute previous day range.");
  }

  type DayKey = string;
  const buckets = new Map<DayKey, NormCandle[]>();
  for (const candle of normalized) {
    const date = new Date(candle.time * 1000);
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
    const arr = buckets.get(key);
    if (arr) arr.push(candle);
    else buckets.set(key, [candle]);
  }

  const orderedKeys = Array.from(buckets.keys()).sort((a, b) => {
    const ax = buckets.get(a)![0].time;
    const bx = buckets.get(b)![0].time;
    return ax - bx;
  });

  // Pick the bucket immediately before the most recent one. If there's only
  // a single day in the loaded window, fall back to that day's range so the
  // user still sees something meaningful.
  const targetKey = orderedKeys.length >= 2 ? orderedKeys[orderedKeys.length - 2] : orderedKeys[0];
  const day = buckets.get(targetKey)!;
  if (day.length === 0) {
    throw new Error("Previous day bucket is empty.");
  }

  let highCandle = day[0];
  let lowCandle = day[0];
  for (const c of day) {
    if (c.high > highCandle.high) highCandle = c;
    if (c.low < lowCandle.low) lowCandle = c;
  }

  const high: SwingAnchor = {
    type: "high",
    index: -1,
    time: highCandle.time,
    price: highCandle.high,
  };
  const low: SwingAnchor = {
    type: "low",
    index: -1,
    time: lowCandle.time,
    price: lowCandle.low,
  };

  // Direction: up if the high came after the low (price climbed through the
  // day), down otherwise. We use the actual candle timestamps so the
  // Fibonacci levels orient sensibly (0% on the most recent extreme).
  const direction: "up" | "down" = high.time >= low.time ? "up" : "down";
  return { high, low, direction };
}

function normalizeCandles(candles: ChartActionCandle[]): NormCandle[] {
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
    .sort((a, b) => Number(a.time) - Number(b.time)) as NormCandle[];
}

function fallbackRangeFromNorm(candles: NormCandle[]): { low: SwingAnchor; high: SwingAnchor } {
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
