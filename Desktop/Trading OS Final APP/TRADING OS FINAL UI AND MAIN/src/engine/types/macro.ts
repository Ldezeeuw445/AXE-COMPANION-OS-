/**
 * engine/types/macro.ts
 * =====================
 * Macro contract — UI-facing shape.
 * FRED, FMP, or cached — always returns this.
 */

export interface MacroDataPoint {
  date: string;
  value: number;
  change?: number;
  changePercent?: number;
}

export interface MacroSeries {
  key: string;
  name: string;
  description?: string;
  unit?: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  data: MacroDataPoint[];
  lastUpdated: string;
}

export interface MacroFilter {
  range?: '1M' | '3M' | '6M' | '1Y' | '5Y' | 'ALL';
}
