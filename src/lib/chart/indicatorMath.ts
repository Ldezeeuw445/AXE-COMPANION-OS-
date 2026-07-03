export type IndicatorMathCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume?: number | null;
  volume?: number | null;
};

export type BollingerPoint = {
  middle: number | null;
  upper: number | null;
  lower: number | null;
};

export type MacdPoint = {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
};

/**
 * Wilder-smoothed Average True Range. True Range at bar i is
 * max(high-low, |high - prevClose|, |low - prevClose|). The first
 * `period` bars seed with a simple average; after that we use Wilder
 * smoothing `(atr*(n-1) + tr) / n`. The early bars use a cumulative
 * fallback so callers don't have to handle nulls before warm-up — this
 * matches LuxAlgo's `nz(ta.atr(200), ta.cum(high-low) / (bar_index+1))`.
 */
export function atrSeries(candles: IndicatorMathCandle[], period: number): Array<number> {
  const out = Array<number>(candles.length).fill(0);
  if (candles.length === 0 || period <= 0) return out;
  let seedSum = 0;
  let cumSum = 0;
  let atr: number | null = null;
  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i];
    const prevClose = i > 0 ? candles[i - 1].close : c.close;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose),
    );
    cumSum += tr;
    if (atr == null) {
      seedSum += tr;
      if (i + 1 >= period) {
        atr = seedSum / period;
        out[i] = atr;
      } else {
        out[i] = cumSum / (i + 1);
      }
    } else {
      atr = (atr * (period - 1) + tr) / period;
      out[i] = atr;
    }
  }
  return out;
}

export function smaSeries(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i] ?? 0;
    if (i >= period) sum -= values[i - period] ?? 0;
    if (i + 1 >= period) out[i] = sum / period;
  }
  return out;
}

export function emaSeries(values: Array<number | null>, period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (period <= 0) return out;
  const multiplier = 2 / (period + 1);
  let ema: number | null = null;
  const seed: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value == null || !Number.isFinite(value)) continue;
    if (ema == null) {
      seed.push(value);
      if (seed.length === period) {
        ema = seed.reduce((sum, item) => sum + item, 0) / period;
        out[i] = ema;
      }
      continue;
    }
    ema = value * multiplier + ema * (1 - multiplier);
    out[i] = ema;
  }
  return out;
}

export function stddevSeries(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (period <= 0) return out;
  for (let i = period - 1; i < values.length; i += 1) {
    const slice = values.slice(i + 1 - period, i + 1);
    const mean = slice.reduce((sum, value) => sum + value, 0) / period;
    const variance = slice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    out[i] = Math.sqrt(variance);
  }
  return out;
}

export function bollingerBands(values: number[], period = 20, multiplier = 2): BollingerPoint[] {
  const middle = smaSeries(values, period);
  const deviation = stddevSeries(values, period);
  return values.map((_, index) => {
    const mid = middle[index];
    const dev = deviation[index];
    if (mid == null || dev == null) return { middle: mid, upper: null, lower: null };
    return {
      middle: mid,
      upper: mid + dev * multiplier,
      lower: mid - dev * multiplier,
    };
  });
}

export function sessionVwap(candles: IndicatorMathCandle[]): Array<number | null> {
  const out: Array<number | null> = Array(candles.length).fill(null);
  let sessionKey: string | null = null;
  let pvSum = 0;
  let volumeSum = 0;
  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i];
    const nextKey = utcSessionKey(candle.time);
    if (nextKey !== sessionKey) {
      sessionKey = nextKey;
      pvSum = 0;
      volumeSum = 0;
    }
    const volume = Math.max(0, Number(candle.tickVolume ?? candle.volume ?? 0) || 0);
    if (volume <= 0) continue;
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    pvSum += typicalPrice * volume;
    volumeSum += volume;
    out[i] = volumeSum > 0 ? pvSum / volumeSum : null;
  }
  return out;
}


/** Wilder-smoothed RSI — matches MT5 RSI(14). */
export function rsiSeries(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (values.length <= period || period <= 0) return out;

  let seedGain = 0;
  let seedLoss = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) seedGain += change;
    else seedLoss += Math.abs(change);
  }
  let avgGain = seedGain / period;
  let avgLoss = seedLoss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macdSeries(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdPoint[] {
  const fast = emaSeries(values, fastPeriod);
  const slow = emaSeries(values, slowPeriod);
  const macd = values.map((_, index) => {
    const f = fast[index];
    const s = slow[index];
    return f == null || s == null ? null : f - s;
  });
  const signal = emaSeries(macd, signalPeriod);
  return values.map((_, index) => {
    const m = macd[index];
    const s = signal[index];
    return {
      macd: m,
      signal: s,
      histogram: m == null || s == null ? null : m - s,
    };
  });
}

export function pointOfControl(
  candles: IndicatorMathCandle[],
  lookback = 100,
  bins = 50,
): { price: number; volume: number } | null {
  const slice = candles.slice(-lookback);
  if (slice.length === 0) return null;
  const low = Math.min(...slice.map((candle) => candle.low));
  const high = Math.max(...slice.map((candle) => candle.high));
  const range = high - low;
  if (!Number.isFinite(range) || range <= 0) return null;
  const weights = Array(Math.max(2, bins)).fill(0) as number[];
  const step = range / weights.length;
  for (const candle of slice) {
    const volume = Math.max(0, Number(candle.tickVolume ?? candle.volume ?? 0) || 0);
    if (volume <= 0) continue;
    const start = Math.max(0, Math.floor((candle.low - low) / step));
    const end = Math.min(weights.length - 1, Math.floor((candle.high - low) / step));
    const span = Math.max(1, end - start + 1);
    for (let index = start; index <= end; index += 1) {
      weights[index] += volume / span;
    }
  }
  let bestIndex = -1;
  let bestVolume = 0;
  for (let index = 0; index < weights.length; index += 1) {
    if (weights[index] > bestVolume) {
      bestVolume = weights[index];
      bestIndex = index;
    }
  }
  if (bestIndex < 0 || bestVolume <= 0) return null;
  return {
    price: low + step * (bestIndex + 0.5),
    volume: bestVolume,
  };
}

function utcSessionKey(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}
