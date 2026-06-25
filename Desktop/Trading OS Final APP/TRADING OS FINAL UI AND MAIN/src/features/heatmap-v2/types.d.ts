/**
 * HeatmapV2 — Finviz-style market cap weighted treemap.
 * Adapter contract. Mirror this in your real adapter (FMP ultimate has
 * everything needed: marketCap, sector, price, changesPercentage, volume,
 * peRatio).
 */

export type Timeframe = "1D" | "1W" | "1M" | "YTD" | "1Y";

export type MetricMode = "performance" | "volume" | "pe";

export interface HeatmapTicker {
  symbol: string;
  name: string;
  sector: string;
  marketCap: number; // in USD, used for treemap area weighting
  price: number;
  // percentage change per timeframe (e.g. { "1D": 1.24, "1W": -2.1, ... })
  changes: Partial<Record<Timeframe, number>>;
  // optional extras for tooltip + metric modes
  volume?: number;
  avgVolume?: number;
  peRatio?: number;
  sparkline?: number[]; // small array of price points for hover preview
}

export interface HeatmapSnapshot {
  asOf: number; // epoch ms
  tickers: HeatmapTicker[];
}

export interface HeatmapDataSource {
  /**
   * Return a snapshot of all tickers. Implementations are free to cache
   * and throttle — the component will call this on mount and on manual
   * refresh. AbortSignal may be provided.
   */
  getSnapshot(signal?: AbortSignal): Promise<HeatmapSnapshot>;
}

export interface TreemapNode {
  symbol: string;
  name: string;
  sector: string;
  value: number; // weighting (market cap)
  metricValue: number; // driver for color (pct change, relVol, pe)
  raw: HeatmapTicker;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TreemapSector {
  sector: string;
  value: number;
  x: number;
  y: number;
  w: number;
  h: number;
  tickers: TreemapNode[];
}
