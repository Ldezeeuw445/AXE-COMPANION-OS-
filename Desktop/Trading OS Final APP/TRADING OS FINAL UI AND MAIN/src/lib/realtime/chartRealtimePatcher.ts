import type { BarUpdateMessage, TickMessage } from './liveEngineTypes';

export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

/**
 * Patch only the last candle in-place (or append if missing).
 * This avoids full series reloads.
 */
export function applyBarUpdate(candles: Candle[], msg: BarUpdateMessage): Candle[] {
  if (candles.length === 0) return [msg.bar];
  const last = candles[candles.length - 1];
  if (last.time === msg.bar.time) {
    const next = [...candles];
    next[next.length - 1] = { ...last, ...msg.bar };
    return next;
  }
  // If stream jumped forward (new bar), append.
  if (new Date(msg.bar.time).getTime() > new Date(last.time).getTime()) {
    return [...candles, msg.bar];
  }
  // Out-of-order update: ignore.
  return candles;
}

/**
 * Optional: use ticks to update the current candle close/high/low without reloading history.
 */
export function applyTickToOpenCandle(candles: Candle[], _msg: TickMessage): Candle[] {
  // Intentionally minimal: you typically rely on bar_update for OHLC correctness.
  return candles;
}

