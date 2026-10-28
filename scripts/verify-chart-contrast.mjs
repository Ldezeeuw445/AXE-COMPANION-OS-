/**
 * Every chart line must be visible on the canvas it is drawn on.
 *
 * Measured on 2026-10-11, before this guard existed: nine colours scored under
 * WCAG 1.4.11's 3:1 for graphical objects. Among them the stop-loss line on
 * the dark theme (2.81:1) and the sell order line on the light theme (2.96:1)
 * — the two lines a trader most needs to find in a hurry.
 *
 * "Looks fine to me" is not a measurement, and it is especially not one on a
 * screen in sunlight.
 *
 * Run: node scripts/verify-chart-contrast.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHART_THEMES, CHART_THEME_KEYS } from "../src/components/chart/chartTheme.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** WCAG 1.4.11 — non-text contrast for graphical objects. */
const MIN_RATIO = 3;

function parseColor(c) {
  const s = String(c).trim();
  if (s.startsWith("#")) {
    const h = s.slice(1);
    const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16), 1];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(",").map((x) => Number(x.trim()));
  return [p[0], p[1], p[2], p[3] ?? 1];
}

const channel = (v) => {
  const x = v / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const flatten = (fg, bg) => [
  fg[0] * fg[3] + bg[0] * (1 - fg[3]),
  fg[1] * fg[3] + bg[1] * (1 - fg[3]),
  fg[2] * fg[3] + bg[2] * (1 - fg[3]),
];
function contrast(fg, bg) {
  const a = luminance(flatten(fg, bg)) + 0.05;
  const b = luminance(bg) + 0.05;
  return a > b ? a / b : b / a;
}

/** Everything a trader reads off the canvas. */
const MEASURED = [
  "entryLine",
  "stopLine",
  "takeLine",
  "pendingLine",
  "alertLine",
  "orderBuy",
  "orderSell",
  "textColor",
  "positiveText",
  "negativeText",
  "neutralText",
  "crosshair",
];


/**
 * Brettel-style deuteranopia approximation, good enough to answer "would these
 * two still look different?". Not a clinical model, and it does not need to be.
 */
function simulateDeuteranopia([r, g, b]) {
  return [
    0.625 * r + 0.375 * g + 0.0 * b,
    0.7 * r + 0.3 * g + 0.0 * b,
    0.0 * r + 0.3 * g + 0.7 * b,
  ];
}

console.log("chart contrast");

for (const key of CHART_THEME_KEYS) {
  const theme = CHART_THEMES[key];
  const bg = parseColor(theme.chartCanvasBackground);

  check(`${theme.label}: every line clears ${MIN_RATIO}:1 on its own canvas`, () => {
    const failures = [];
    for (const field of MEASURED) {
      const fg = parseColor(theme[field]);
      assert.ok(fg, `${theme.label}.${field} is not a colour this guard can read: ${theme[field]}`);
      const ratio = contrast(fg, bg);
      if (ratio < MIN_RATIO) failures.push(`${field} ${theme[field]} → ${ratio.toFixed(2)}:1`);
    }
    assert.deepEqual(failures, [], `invisible on ${theme.label}:\n  ${failures.join("\n  ")}`);
  });

  check(`${theme.label}: candles are legible`, () => {
    // A hollow candle body carries its contrast in the border, not the fill —
    // that is deliberate TradingView styling, not an oversight. Measure
    // whichever one is actually doing the work.
    for (const side of ["bull", "bear"]) {
      const body = parseColor(theme[side]);
      const border = parseColor(theme[`${side}Border`]);
      const best = theme.borderVisible
        ? Math.max(contrast(body, bg), contrast(border, bg))
        : contrast(body, bg);
      assert.ok(
        best >= MIN_RATIO,
        `${theme.label} ${side} candle is invisible: body ${theme[side]}, border ${theme[`${side}Border`]} → ${best.toFixed(2)}:1`,
      );
    }
  });

  check(`${theme.label}: buy and sell stay apart for a colour-blind trader`, () => {
    // Luminance contrast is the wrong test here: blue and red at the same
    // luminance are easy to tell apart with normal vision. The real risk is
    // red/green confusion, which affects roughly one man in twelve — and a
    // trader who cannot tell a buy line from a sell line will eventually read
    // one as the other on a fast chart.
    const buy = simulateDeuteranopia(parseColor(theme.orderBuy));
    const sell = simulateDeuteranopia(parseColor(theme.orderSell));
    const distance = Math.hypot(buy[0] - sell[0], buy[1] - sell[1], buy[2] - sell[2]);
    assert.ok(
      distance >= 60,
      `through deuteranopia, buy ${theme.orderBuy} and sell ${theme.orderSell} are ${distance.toFixed(0)} apart in RGB — too close to read at a glance`,
    );
  });
}

/* ── the indicator panes ──────────────────────────────────────────────────
   These were never measured: they lived inside IndicatorPane as two private
   palettes behind an `isDark` boolean, out of this guard's reach. The first
   run after the move found the paper theme's bullish volume bar at 2.03:1 —
   a bar a trader is meant to compare against the bearish one.

   Gridline-ish fields are excluded for the same reason `grid` is: WCAG 1.4.11
   is about objects you read, and these are faint structure behind them. */
const INDICATOR_MEASURED = [
  "bullBar",
  "bearBar",
  "rsiLine",
  "macdLine",
  "macdSignal",
  "macdHistBull",
  "macdHistBear",
  "stochK",
  "stochD",
  "adxLine",
  "plusDiLine",
  "minusDiLine",
  "labelEmphasis",
  "labelNormal",
];
const INDICATOR_STRUCTURE = ["levelLine", "levelLineDim", "separator"];

for (const key of CHART_THEME_KEYS) {
  const theme = CHART_THEMES[key];
  const bg = parseColor(theme.chartCanvasBackground);

  check(`${theme.label}: every indicator a trader reads clears ${MIN_RATIO}:1`, () => {
    const failures = [];
    for (const field of INDICATOR_MEASURED) {
      const value = theme.indicator[field];
      const fg = parseColor(value);
      assert.ok(fg, `${theme.label}.indicator.${field} is not a readable colour: ${value}`);
      const ratio = contrast(fg, bg);
      if (ratio < MIN_RATIO) failures.push(`${field} ${value} → ${ratio.toFixed(2)}:1`);
    }
    assert.deepEqual(failures, [], `invisible on ${theme.label}:\n  ${failures.join("\n  ")}`);
  });

  check(`${theme.label}: the volume bars are two different colours, not two darknesses`, () => {
    // On paper they were both near-black greys at different opacities, which
    // is not a distinction you can make at a glance on a volume histogram.
    const bull = flatten(parseColor(theme.indicator.bullBar), bg);
    const bear = flatten(parseColor(theme.indicator.bearBar), bg);
    const apart = contrast(simulateDeuteranopia(bull), simulateDeuteranopia(bear));
    const hueGap = Math.max(
      Math.abs(bull[0] - bear[0]),
      Math.abs(bull[1] - bear[1]),
      Math.abs(bull[2] - bear[2]),
    );
    assert.ok(
      apart >= 1.6 || hueGap >= 40,
      `${theme.label} bull/bear volume bars are too alike: ${theme.indicator.bullBar} vs ${theme.indicator.bearBar}`,
    );
  });
}

check("IndicatorPane keeps no palette of its own", () => {
  // It held two, behind an `isDark` boolean. A colour change in chartTheme.ts
  // never reached the indicator bars, and a fifth preset would have silently
  // inherited whichever of the two its isDark flag picked.
  const pane = readFileSync(
    new URL("../src/components/chart/indicators/IndicatorPane.tsx", import.meta.url),
    "utf8",
  );
  const code = pane.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/indicatorColors\s*\(/.test(code), "the private palette function must be gone");
  assert.ok(
    !/rgba\(\d/.test(code),
    "no colour literal may live in the pane any more; they belong in chartTheme.ts",
  );
  assert.ok(code.includes("theme.indicator"), "the pane must read the theme's palette");
  assert.ok(!/isDark/.test(code), "the boolean that split the two palettes must be gone");

  const screen = readFileSync(
    new URL("../src/components/chart/ChartScreen.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(
    /<IndicatorPane[^>]*theme=\{chartTheme\}/.test(screen),
    "the one call site must hand over the whole theme",
  );
});

check("a theme switch actually repaints the bars", () => {
  // The volume bars and the MACD histogram bake their colour into a memoized
  // geometry object. That memo did not depend on the palette, so switching
  // theme left the bars in the old theme's colours until a new candle, a
  // resize or a mode switch happened to invalidate it. eslint's
  // exhaustive-deps had been printing this warning the whole time.
  const pane = readFileSync(
    new URL("../src/components/chart/indicators/IndicatorPane.tsx", import.meta.url),
    "utf8",
  );
  const deps = pane.match(/\}, \[candles[^\]]*\]\);/);
  assert.ok(deps, "the geometry memo's dependency array moved; re-check this guard");
  assert.ok(
    deps[0].includes("colors"),
    "the geometry memo bakes palette colours in, so it must depend on the palette",
  );
  assert.ok(
    !/eslint-disable[^\n]*exhaustive-deps/.test(pane),
    "silencing the warning is not fixing it",
  );
});

check("every preset declares its own indicator palette", () => {
  for (const key of Object.keys(CHART_THEMES)) {
    const palette = CHART_THEMES[key].indicator;
    assert.ok(palette, `${key} has no indicator palette`);
    for (const field of [...INDICATOR_MEASURED, ...INDICATOR_STRUCTURE, "titleText"]) {
      assert.ok(palette[field], `${key}.indicator.${field} is missing`);
    }
  }
});

console.log(`\n${passed} checks passed`);
