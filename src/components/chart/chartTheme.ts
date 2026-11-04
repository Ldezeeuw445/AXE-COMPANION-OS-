/**
 * AXE Chart Theme System
 *
 * 4 presets: Midnight (OLED black), Charcoal (warm dark), Slate (TradingView-style),
 * Paper (light mode). Each preset defines candle, grid, axis, and overlay colors
 * calibrated for legibility on its background.
 *
 * Grid style is a per-user preference (solid = no grid, grid = with gridlines),
 * persisted in localStorage.
 */

export type ChartThemeKey = "midnight" | "charcoal" | "slate" | "paper";
export type ChartGridStyle = "solid" | "grid";

export interface ChartThemeConfig {
  key: ChartThemeKey;
  label: string;
  /** Base color of the chart frame. */
  background: string;
  /** Chart canvas itself. */
  chartCanvasBackground: string;
  textColor: string;
  grid: string;
  crosshair: string;
  /** Color of the L-shaped axis separator line. */
  axisSeparator: string;
  borderColor: string;
  bull: string;
  bear: string;
  bullWick: string;
  bearWick: string;
  /** Border around bull candle bodies. Only visible when borderVisible is true. */
  bullBorder: string;
  /** Border around bear candle bodies. Only visible when borderVisible is true. */
  bearBorder: string;
  /** Whether candle borders are rendered. */
  borderVisible: boolean;
  /** Crosshair label background. */
  crosshairLabelBg: string;
  entryLine: string;
  stopLine: string;
  takeLine: string;
  pendingLine: string;
  alertLine: string;
  positiveText: string;
  negativeText: string;
  neutralText: string;
  cyanAccent: string;
  frameGlow: string;
  /** Solid order lines (TradePlanLine, pending entry). Per theme: a single
   *  shared pair could not clear 3:1 on both a black and a paper canvas. */
  orderBuy: string;
  orderSell: string;
  /** Dark theme? Used by overlays to pick text/bg colors. */
  isDark: boolean;
  /** Colors for the indicator panes under the chart. See IndicatorPalette. */
  indicator: IndicatorPalette;
}

/**
 * The colors the indicator panes (volume, RSI, MACD) draw with.
 *
 * These lived inside `IndicatorPane` as two palettes behind an `isDark`
 * boolean. Two problems with that: a color change here never reached the
 * indicator bars, and a fifth preset would silently inherit whichever of the
 * two its `isDark` flag happened to pick instead of declaring its own.
 *
 * Every value below is byte-identical to what IndicatorPane drew before the
 * move, so the chart looks exactly the same — the point of this change is
 * that there is now one place to edit, not a new look.
 */
export interface IndicatorPalette {
  bullBar: string;
  bearBar: string;
  rsiLine: string;
  macdLine: string;
  macdSignal: string;
  macdHistBull: string;
  macdHistBear: string;
  /**
   * Stochastic %K and %D.
   *
   * Violet and amber rather than the MACD's cyan and amber: the two panes are
   * never open at once, but a trader switching between them should not have to
   * check the title to know which one they are looking at.
   */
  stochK: string;
  stochD: string;
  /**
   * ADX and the two directional lines.
   *
   * ADX is deliberately neutral — it says how strongly price trends, not which
   * way, and colouring it green or red would suggest a direction it does not
   * carry. +DI and -DI use the same teal and rose as the volume bars, because
   * they mean the same thing there: buyers ahead, sellers ahead.
   */
  adxLine: string;
  plusDiLine: string;
  minusDiLine: string;
  levelLine: string;
  levelLineDim: string;
  separator: string;
  labelEmphasis: string;
  labelNormal: string;
  /** Tailwind class for the pane title, which is DOM text rather than canvas. */
  titleText: string;
}

/** Shared by the three dark presets, which drew identically before the move. */
const DARK_INDICATORS: IndicatorPalette = {
  bullBar: "rgba(45,212,191,0.78)",
  bearBar: "rgba(239,68,68,0.78)",
  rsiLine: "rgba(34,211,238,0.95)",
  macdLine: "rgba(34,211,238,0.95)",
  macdSignal: "rgba(250,204,21,0.92)",
  macdHistBull: "rgba(45,212,191,0.72)",
  macdHistBear: "rgba(244,63,94,0.72)",
  stochK: "rgba(167,139,250,0.95)",
  stochD: "rgba(250,204,21,0.92)",
  adxLine: "rgba(226,232,240,0.92)",
  plusDiLine: "rgba(45,212,191,0.92)",
  minusDiLine: "rgba(244,63,94,0.92)",
  levelLine: "rgba(255,255,255,0.16)",
  levelLineDim: "rgba(255,255,255,0.08)",
  separator: "rgba(255,255,255,0.04)",
  labelEmphasis: "rgba(232,238,246,0.85)",
  labelNormal: "rgba(168,180,196,0.7)",
  titleText: "text-white/70",
};

/**
 * Paper.
 *
 * The volume bars used to mimic the hollow candle styling — a light grey bull
 * bar and a near-black bear bar. Measured 2026-10-17 against the paper canvas
 * (#d7d6d0) when the palette moved here and the contrast guard finally reached
 * it: the bull bar scored **2.03:1**, under WCAG 1.4.11's 3:1, and the two
 * bars differed mostly in how dark they were. A hollow candle carries its
 * contrast in its border; a volume bar has no border, so it had nothing.
 *
 * They now use the same teal/rose the MACD histogram already uses on this
 * theme — 4.26:1 and 5.41:1, two different hues, and one visual language for
 * everything drawn in the indicator panes.
 */
const PAPER_INDICATORS: IndicatorPalette = {
  bullBar: "rgba(0,100,85,0.92)" /* dark teal — was rgba(42,46,57,0.38) at 2.03:1 */,
  bearBar: "rgba(150,18,35,0.92)" /* dark rose */,
  rsiLine: "rgba(0,90,110,1)" /* dark cyan — same hue as the RSI cyan */,
  macdLine: "rgba(0,90,110,1)",
  macdSignal: "rgba(160,110,0,1)" /* dark amber — same hue as the yellow signal */,
  macdHistBull: "rgba(0,100,85,0.92)" /* dark teal */,
  macdHistBear: "rgba(150,18,35,0.92)" /* dark rose */,
  stochK: "rgba(76,29,149,1)" /* dark violet — the dark theme's violet, darkened */,
  stochD: "rgba(160,110,0,1)" /* dark amber — same as the MACD signal */,
  adxLine: "rgba(28,32,42,0.95)" /* near-black: neutral, and the strongest line in the pane */,
  plusDiLine: "rgba(0,100,85,0.92)" /* dark teal */,
  minusDiLine: "rgba(150,18,35,0.92)" /* dark rose */,
  levelLine: "rgba(0,0,0,0.22)",
  levelLineDim: "rgba(0,0,0,0.12)",
  separator: "rgba(0,0,0,0.10)",
  labelEmphasis: "rgba(20,25,35,0.92)",
  labelNormal: "rgba(50,55,65,0.82)",
  titleText: "text-black/80",
};

/* ── Theme presets ──────────────────────────────────────────────── */

const MIDNIGHT: ChartThemeConfig = {
  key: "midnight",
  label: "Midnight",
  background: "#000000",
  chartCanvasBackground: "#000000",
  textColor: "rgba(220,230,245,0.90)",
  grid: "rgba(255,255,255,0.03)",
  crosshair: "rgba(0,224,255,0.58)",
  axisSeparator: "rgba(255,255,255,0.08)",
  borderColor: "rgba(255,255,255,0.06)",
  bull: "#1F9C7B",
  bear: "#C95450",
  bullWick: "rgba(31,156,123,0.95)",
  bearWick: "rgba(201,84,80,0.95)",
  bullBorder: "#1F9C7B",
  bearBorder: "#C95450",
  borderVisible: false,
  crosshairLabelBg: "#0a0a0a",
  entryLine: "rgba(110,178,252,0.7)",
  stopLine: "rgba(226,96,92,0.92)",
  takeLine: "rgba(31,156,123,0.7)",
  pendingLine: "rgba(110,178,252,0.68)",
  alertLine: "rgba(244,191,99,0.6)",
  positiveText: "rgba(31,156,123,0.95)",
  negativeText: "rgba(201,84,80,0.95)",
  neutralText: "rgba(139,149,168,0.95)",
  cyanAccent: "rgba(0,224,255,0.80)",
  frameGlow: "0 0 0 1px rgba(255,255,255,0.04) inset",
  orderBuy: "#2E9BD6",
  orderSell: "#E13947",
  isDark: true,
  indicator: DARK_INDICATORS,
};

const CHARCOAL: ChartThemeConfig = {
  key: "charcoal",
  label: "Charcoal",
  background: "#1a1a1a",
  chartCanvasBackground: "#1a1a1a",
  textColor: "rgba(220,225,235,0.88)",
  grid: "rgba(255,255,255,0.05)",
  crosshair: "rgba(0,224,255,0.58)",
  axisSeparator: "rgba(255,255,255,0.10)",
  borderColor: "rgba(255,255,255,0.07)",
  bull: "#26a69a",
  bear: "#ef5350",
  bullWick: "rgba(38,166,154,0.95)",
  bearWick: "rgba(239,83,80,0.95)",
  bullBorder: "#26a69a",
  bearBorder: "#ef5350",
  borderVisible: false,
  crosshairLabelBg: "#222222",
  entryLine: "rgba(110,178,252,0.7)",
  stopLine: "rgba(239,83,80,0.7)",
  takeLine: "rgba(38,166,154,0.7)",
  pendingLine: "rgba(110,178,252,0.68)",
  alertLine: "rgba(244,191,99,0.6)",
  positiveText: "rgba(38,166,154,0.95)",
  negativeText: "rgba(239,83,80,0.95)",
  neutralText: "rgba(139,149,168,0.95)",
  cyanAccent: "rgba(0,224,255,0.80)",
  frameGlow: "0 0 0 1px rgba(255,255,255,0.05) inset",
  orderBuy: "#2E9BD6",
  orderSell: "#E13947",
  isDark: true,
  indicator: DARK_INDICATORS,
};

const SLATE: ChartThemeConfig = {
  key: "slate",
  label: "Slate",
  background: "#2a2e39",
  chartCanvasBackground: "#2a2e39",
  textColor: "rgba(210,215,225,0.88)",
  grid: "rgba(255,255,255,0.06)",
  crosshair: "rgba(0,224,255,0.58)",
  axisSeparator: "rgba(255,255,255,0.12)",
  borderColor: "rgba(255,255,255,0.08)",
  bull: "#26a69a",
  bear: "#ef5350",
  bullWick: "rgba(38,166,154,0.95)",
  bearWick: "rgba(239,83,80,0.95)",
  bullBorder: "#26a69a",
  bearBorder: "#ef5350",
  borderVisible: false,
  crosshairLabelBg: "#323640",
  entryLine: "rgba(110,178,252,0.7)",
  stopLine: "rgba(239,83,80,0.7)",
  takeLine: "rgba(38,166,154,0.7)",
  pendingLine: "rgba(110,178,252,0.68)",
  alertLine: "rgba(244,191,99,0.6)",
  positiveText: "rgba(38,166,154,0.95)",
  negativeText: "rgba(239,83,80,0.95)",
  neutralText: "rgba(150,158,175,0.95)",
  cyanAccent: "rgba(0,224,255,0.80)",
  frameGlow: "0 0 0 1px rgba(255,255,255,0.06) inset",
  orderBuy: "#2E9BD6",
  orderSell: "#E13947",
  isDark: true,
  indicator: DARK_INDICATORS,
};

const PAPER: ChartThemeConfig = {
  key: "paper",
  label: "Paper",
  background: "#d7d6d0",
  chartCanvasBackground: "#d7d6d0",
  textColor: "rgba(30,35,45,0.88)",
  grid: "rgba(0,0,0,0.06)",
  crosshair: "rgba(0,88,135,0.78)",
  axisSeparator: "rgba(0,0,0,0.14)",
  borderColor: "rgba(0,0,0,0.08)",
  /* TradingView-style candles: hollow white bullish, solid dark bearish */
  bull: "#ffffff",
  bear: "#131722",
  bullWick: "#2a2e39",
  bearWick: "#131722",
  bullBorder: "#2a2e39",
  bearBorder: "#131722",
  borderVisible: true,
  crosshairLabelBg: "#c8c7c2",
  entryLine: "#0B4F8F",
  stopLine: "#A70F2A",
  takeLine: "#006B5B",
  pendingLine: "#0B4F8F",
  alertLine: "rgba(140,95,0,0.92)",
  positiveText: "rgba(4,105,87,0.98)",
  negativeText: "rgba(179,18,30,0.98)",
  neutralText: "rgba(80,85,95,0.95)",
  cyanAccent: "rgba(0,160,200,0.80)",
  frameGlow: "none",
  orderBuy: "#0B4F8F",
  orderSell: "#A3101C",
  isDark: false,
  indicator: PAPER_INDICATORS,
};

/* ── Public API ─────────────────────────────────────────────────── */

export const CHART_THEMES: Record<ChartThemeKey, ChartThemeConfig> = {
  midnight: MIDNIGHT,
  charcoal: CHARCOAL,
  slate: SLATE,
  paper: PAPER,
};

export const CHART_THEME_KEYS: ChartThemeKey[] = ["midnight", "paper"];

/**
 * Legacy shared order colours — the midnight values.
 *
 * Kept only for components that have not been made theme-aware yet. Measured
 * on 2026-10-11, the old pair scored 3.66:1 and 2.96:1 on the paper canvas:
 * a sell order line you could barely find on a light chart. Prefer
 * `getChartTheme(key).orderBuy / .orderSell`.
 */
export const CHART_ORDER_BUY_COLOR = "#2E9BD6";
export const CHART_ORDER_SELL_COLOR = "#E13947";

/** Get a theme config by key. Falls back to midnight. */
export function getChartTheme(key?: string | null): ChartThemeConfig {
  if (key && key in CHART_THEMES) return CHART_THEMES[key as ChartThemeKey];
  return MIDNIGHT;
}

/**
 * Backward-compat default export — same as midnight.
 * Components that are *not yet* theme-aware can keep using this.
 */
export const CHART_THEME = MIDNIGHT;

/* ── localStorage helpers ──────────────────────────────────────── */

const STORAGE_KEY = "axe-chart-theme";
const GRID_STORAGE_KEY = "axe-chart-grid";

export function readChartThemeKey(): ChartThemeKey {
  if (typeof window === "undefined") return "midnight";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && (CHART_THEME_KEYS as readonly string[]).includes(stored))
    return stored as ChartThemeKey;
  return "midnight";
}

export function writeChartThemeKey(key: ChartThemeKey): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, key);
}

export function readGridStyle(): ChartGridStyle {
  if (typeof window === "undefined") return "grid";
  const stored = localStorage.getItem(GRID_STORAGE_KEY);
  if (stored === "solid" || stored === "grid") return stored;
  return "grid";
}

export function writeGridStyle(style: ChartGridStyle): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GRID_STORAGE_KEY, style);
}
