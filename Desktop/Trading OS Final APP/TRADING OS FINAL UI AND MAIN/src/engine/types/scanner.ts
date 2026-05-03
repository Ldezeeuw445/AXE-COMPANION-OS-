/**
 * engine/types/scanner.ts
 * =======================
 * Scanner contract — UI-facing shape.
 * Heatmap + scanner results always return this fixed shape.
 */

export interface ScannerMetric {
  name: string;
  value: number;
  unit?: string;
  percentile?: number;  // 0-100, how this ranks vs market
}

export interface ScannerResult {
  symbol: string;
  name?: string;
  score: number;        // 0-100 composite score
  rank: number;         // Position in results
  signals: string[];    // Active signals (e.g., "RSI oversold", "Volume spike")
  metrics: ScannerMetric[];
  trend: 'strong_up' | 'up' | 'neutral' | 'down' | 'strong_down';
  sector?: string;
  marketCap?: number;
}

export interface HeatmapCell {
  symbol: string;
  changePercent: number;
  volumeRatio: number;  // vs average
  marketCap: number;
  sector: string;
  color: string;        // Calculated heat color
}

export interface HeatmapData {
  sector: string;
  cells: HeatmapCell[];
  avgChange: number;
  totalVolume: number;
}

export interface ScannerFilter {
  sector?: string;
  minMarketCap?: number;
  maxMarketCap?: number;
  minScore?: number;
  signals?: string[];
  limit?: number;
}
