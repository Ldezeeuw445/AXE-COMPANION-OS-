/** Lightweight chart annotation contract — local-first, server-ready. */

export type ChartAnnotationType =
  | "fib_retracement"
  | "trendline"
  | "rectangle"
  | "text"
  | "horizontal_level"
  | "order_block"
  | "fvg";

export type AnnotationPoint = {
  /** Unix seconds (UTCTimestamp). */
  time: number;
  price: number;
};

export type ChartAnnotation = {
  id: string;
  /** Reserved for server persistence later — local store omits it. */
  userId?: string | null;
  accountId?: string | null;
  symbol: string;
  timeframe: string;
  type: ChartAnnotationType;
  points: AnnotationPoint[];
  settings?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

/** Standard Fibonacci retracement levels (0 → 1 from anchor → swing). */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
