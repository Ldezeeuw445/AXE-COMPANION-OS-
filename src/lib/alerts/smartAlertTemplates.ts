export type SmartAlertKind =
  | "context_aware"
  | "predictive"
  | "sentiment"
  | "correlation"
  | "technical_confluence"
  | "position_risk";

export type SmartAlertTemplate = {
  kind: SmartAlertKind;
  type: "position_risk" | "news" | "macro" | "price";
  title: string;
  description: string;
  example: string;
  condition?: string;
  metadata: Record<string, unknown>;
};

export const SMART_ALERT_TEMPLATES: SmartAlertTemplate[] = [
  {
    kind: "context_aware",
    type: "position_risk",
    title: "Context-aware exposure",
    description: "Warn when breakout conflicts with existing book bias.",
    example: "Bullish breakout — but you're already 3× long. Consider taking profit.",
    condition: "concentration",
    metadata: { smartKind: "context_aware", evaluator: "smart" },
  },
  {
    kind: "predictive",
    type: "price",
    title: "Predictive level break",
    description: "AI-scored move through key level within 24h.",
    example: "BTC predicted to break $70K within 24h (confidence band).",
    condition: "above",
    metadata: { smartKind: "predictive", horizonHours: 24, evaluator: "smart" },
  },
  {
    kind: "sentiment",
    type: "news",
    title: "Sentiment shift",
    description: "Sector sentiment spike vs your watchlist.",
    example: "Bullish sentiment shift in tech (+35 pts in 2h).",
    metadata: { smartKind: "sentiment", evaluator: "smart" },
  },
  {
    kind: "correlation",
    type: "position_risk",
    title: "Correlation cluster",
    description: "Portfolio concentration when positions move together.",
    example: "5 tech positions ~87% correlated — diversify?",
    condition: "correlation",
    metadata: { smartKind: "correlation", threshold: 0.8, evaluator: "smart" },
  },
  {
    kind: "technical_confluence",
    type: "price",
    title: "Multi-TF confluence",
    description: "Filtered technical stack with false-signal score.",
    example: "RSI + MACD + BB confluence — low false-signal probability.",
    metadata: { smartKind: "technical_confluence", evaluator: "smart" },
  },
  {
    kind: "position_risk",
    type: "position_risk",
    title: "Missing stop-loss",
    description: "Fire when an open position has no SL on active account.",
    example: "2 positions have no stop-loss — book unprotected.",
    condition: "missing_sl",
    metadata: { smartKind: "position_risk", evaluator: "position_risk" },
  },
];
