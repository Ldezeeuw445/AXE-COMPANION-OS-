/**
 * AXE Color System — 7 semantic colours for AXE chat rendering.
 *
 * Matte, desaturated tones for dark theme. Consistent term→hex mapping
 * so traders build colour→context muscle memory over time.
 *
 * This file is the single source of truth — imported by MarkdownLite
 * (client-side rendering) and can be loaded into AXE Core's system
 * prompt so it knows which terms to bold.
 */

/* ── Palette ─────────────────────────────────────────────────────── */

export const AXE_COLORS = {
  bullishGreen:  "#4ECBA0",
  bearishRose:   "#F07080",
  neutralBlue:   "#7B93DB",
  catalystAmber: "#E8B84B",
  sectionPurple: "#B18CFF",
  signalCyan:    "#56B8D6",
  riskOrange:    "#E88B5A",
} as const;

export type AXEColorCategory = keyof typeof AXE_COLORS;

/* ── Term → hex map ──────────────────────────────────────────────── */

const green  = AXE_COLORS.bullishGreen;
const rose   = AXE_COLORS.bearishRose;
const blue   = AXE_COLORS.neutralBlue;
const amber  = AXE_COLORS.catalystAmber;
const purple = AXE_COLORS.sectionPurple;
const cyan   = AXE_COLORS.signalCyan;
const orange = AXE_COLORS.riskOrange;

/**
 * Every trading term that gets coloured in AXE output.
 * Key = lowercase term, value = hex colour.
 * Case-insensitive lookup at render time.
 */
export const AXE_TERM_COLORS: Record<string, string> = {
  // ── Bullish Green (#4ECBA0) ──
  support:       green,
  bullish:       green,
  long:          green,
  buy:           green,
  "take profit": green,
  tp:            green,
  "higher high": green,
  hh:            green,
  "higher low":  green,
  hl:            green,
  "demand zone": green,
  demand:        green,
  dovish:        green,
  uptrend:       green,
  accumulation:  green,
  oversold:      green,
  entry:         green,

  // ── Bearish Rose (#F07080) ──
  resistance:    rose,
  bearish:       rose,
  short:         rose,
  sell:          rose,
  "stop loss":   rose,
  sl:            rose,
  "lower high":  rose,
  lh:            rose,
  "lower low":   rose,
  ll:            rose,
  "supply zone": rose,
  supply:        rose,
  hawkish:       rose,
  downtrend:     rose,
  rejection:     rose,
  distribution:  rose,
  overbought:    rose,

  // ── Neutral Blue (#7B93DB) ──
  neutral:       blue,
  consolidation: blue,
  range:         blue,
  sideways:      blue,
  equilibrium:   blue,
  indecision:    blue,

  // ── Catalyst Amber (#E8B84B) ──
  catalysts:     amber,
  catalyst:      amber,
  fomc:          amber,
  "core pce":    amber,
  gdp:           amber,
  nfp:           amber,
  cpi:           amber,
  ism:           amber,
  adp:           amber,
  "big 3":       amber,
  "high-impact": amber,
  "news impact": amber,
  ppi:           amber,
  "interest rate": amber,
  fed:           amber,
  ecb:           amber,
  "risk/reward": amber,
  "r:r":         amber,

  // ── Section Purple (#B18CFF) ──
  "market structure":        purple,
  outlook:                   purple,
  "key levels":              purple,
  "key level":               purple,
  "action points":           purple,
  opportunities:             purple,
  considerations:            purple,
  "bias drivers":            purple,
  "next steps":              purple,
  "current context":         purple,
  "exposure consideration":  purple,
  analysis:                  purple,
  summary:                   purple,
  "trade plan":              purple,
  "trade setup":             purple,
  overview:                  purple,
  "technical analysis":      purple,
  "fundamental analysis":    purple,
  "macro overview":          purple,
  "risk assessment":         purple,
  "weekly outlook":          purple,
  "daily outlook":           purple,
  "session recap":           purple,
  "trading plan":            purple,
  "setup review":            purple,
  "journal review":          purple,
  "performance review":      purple,
  sentiment:                 purple,

  // ── Signal Cyan (#56B8D6) ──
  breakout:        cyan,
  breakdown:       cyan,
  confirmation:    cyan,
  momentum:        cyan,
  volume:          cyan,
  "breakout watch": cyan,
  "breakout play":  cyan,
  "price action":   cyan,
  trend:           cyan,
  "break of structure": cyan,
  bos:             cyan,
  "change of character": cyan,
  choch:           cyan,
  "market shift":  cyan,
  mss:             cyan,
  "fair value gap": cyan,
  fvg:             cyan,
  imbalance:       cyan,
  "order block":   cyan,
  ob:              cyan,
  confluence:      cyan,
  divergence:      cyan,

  // ── Risk Orange (#E88B5A) ──
  "risk management": orange,
  volatility:        orange,
  exposure:          orange,
  invalidation:      orange,
  risk:              orange,
  drawdown:          orange,
  overexposure:      orange,

  // ── Extra: patterns & reversals (signal cyan) ──
  reversal:          cyan,
  "swing failure":   cyan,
  sfp:               cyan,
  "liquidity sweep": cyan,
  sweep:             cyan,
  "stop hunt":       cyan,
  manipulation:      cyan,

  // ── Extra: indicators (purple, matches section) ──
  fibonacci:  purple,
  fib:        purple,
  ema:        purple,
  sma:        purple,
  vwap:       purple,
  rsi:        purple,
  macd:       purple,
  atr:        purple,
  bollinger:  purple,

  // ── Extra: sessions (signal cyan) ──
  "london open":       cyan,
  "new york open":     cyan,
  "asian session":     cyan,
  "london session":    cyan,
  "new york session":  cyan,
  killzone:            cyan,
};

/* ── Sub-labels (white bold, no colour) ──────────────────────────── */

export const AXE_SUBLABEL_TERMS = new Set([
  "bias",
  "key levels",
  "key level",
  "trend",
  "current price",
  "neutral",
  "timeframe",
  "context",
  "note",
  "notes",
  "conclusion",
  "recommendation",
  "invalidation",
  "confirmation",
  "execution",
  "session",
  "day range",
  "range",
  "structure",
  "momentum",
  "volatility",
  "volume",
  "liquidity",
]);

/* ── Helpers ─────────────────────────────────────────────────────── */

/** Check if a term is a section header (rendered purple + bold). */
export function isSectionHeader(term: string): boolean {
  const lower = term.toLowerCase().replace(/:$/, "").trim();
  const hex = AXE_TERM_COLORS[lower];
  return hex === AXE_COLORS.sectionPurple;
}

/** Look up colour for a term. Returns hex string or null. */
export function getTermColor(term: string): string | null {
  const lower = term.toLowerCase().replace(/:$/, "").trim();
  return AXE_TERM_COLORS[lower] ?? null;
}
