/**
 * AnalysesLibrary — adapter contract.
 *
 * Wire to your Supabase analyses table + FMP earnings calendar + FRED
 * macro calendar. The shared brain is the single source of truth.
 */

export type AnalysisTag =
  | "FX"
  | "Stocks"
  | "Crypto"
  | "Macro"
  | "Energy"
  | "Tech"
  | "Rates"
  | "Commodities";

export type AnalysisBias = "long" | "short" | "neutral";

export type AnalysisStatus = "draft" | "live" | "hit_target" | "stopped" | "closed";

export interface AnalysisSparkPoint {
  t: number;
  v: number;
}

export interface Analysis {
  id: string;
  title: string;
  summary: string;          // one-liner thesis
  tags: AnalysisTag[];
  symbols: string[];
  bias: AnalysisBias;
  status: AnalysisStatus;
  updatedAt: number;        // epoch ms
  createdAt: number;
  author?: string;
  entry?: number;
  target?: number;
  stop?: number;
  pnlPct?: number;          // current P&L in %
  conviction?: 1 | 2 | 3 | 4 | 5;
  sparkline?: number[];     // small price series for thumbnail
  linkedEventIds?: string[]; // references to CalendarEvent.id
}

export interface TodaysThesis {
  analysisId: string;
  headline: string;         // short punchy
  rationale: string;        // 2-3 sentence
  confidence: 1 | 2 | 3 | 4 | 5;
}

export type CalendarEventKind = "earnings" | "macro" | "fed" | "central_bank" | "other";

export interface CalendarEvent {
  id: string;
  kind: CalendarEventKind;
  title: string;
  at: number;                // epoch ms
  importance: "high" | "medium" | "low";
  symbols?: string[];
  linkedAnalysisIds?: string[];
}

export interface AnalysesDataSource {
  listAnalyses(signal?: AbortSignal): Promise<Analysis[]>;
  getTodaysThesis(signal?: AbortSignal): Promise<TodaysThesis | null>;
  listCalendar(
    windowHours?: number,
    signal?: AbortSignal
  ): Promise<CalendarEvent[]>;
}
