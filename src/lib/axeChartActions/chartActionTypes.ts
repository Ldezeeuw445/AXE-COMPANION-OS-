import type { ChartAnnotation } from "@/components/chart/annotations/types";

export type ChartActionType =
  | "draw_fibonacci"
  | "draw_trendline"
  | "mark_key_level"
  | "add_indicator"
  | "clear_ai_drawings";

export type ChartActionCommand = {
  id: string;
  type: ChartActionType;
  source: "axe" | "user";
  symbol: string;
  timeframe: string;
  accountId?: string;
  payload: Record<string, unknown>;
  requiresUserAcceptance?: boolean;
};

export type ChartActionResult = {
  id: string;
  type: ChartActionType;
  status: "rendered" | "prepared" | "blocked" | "failed";
  message: string;
  annotation?: ChartAnnotation;
  annotations?: ChartAnnotation[];
};

export type ChartActionCandle = {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type ChartActionRenderer = {
  drawFibonacci(command: ChartActionCommand): ChartActionResult;
  drawTrendline(command: ChartActionCommand): ChartActionResult;
  markKeyLevel(command: ChartActionCommand): ChartActionResult;
  addIndicator(command: ChartActionCommand): ChartActionResult;
  clearAiDrawings(command: ChartActionCommand): ChartActionResult;
};

export type ChartActionMemoryState = {
  optIn: boolean;
  drawings: ChartAnnotation[];
};
