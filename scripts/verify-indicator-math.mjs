/**
 * The arithmetic every chart and every alert sits on.
 *
 * `src/lib/chart/indicatorMath.ts` is the single source of truth for RSI,
 * MACD, Bollinger, ATR, VWAP and the volume point of control — the chart
 * layer, the indicator pane and `smartAlertRules` all read it. Nothing
 * verified it. An RSI that is wrong does not look wrong; it looks like a
 * signal, and the alert fires on it.
 *
 * So: analytic cases where the right answer can be derived rather than
 * remembered, a second longhand implementation of Wilder's recurrence to catch
 * a typo in the first, and the three bugs that were in here.
 *
 * Run: node scripts/verify-indicator-math.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DEFAULT_SESSION_ZONE,
  resolveSessionZone,
  sessionDayKey,
} from "../src/lib/chart/sessionDay.ts";
import {
  atrSeries,
  bollingerBands,
  emaSeries,
  macdSeries,
  pointOfControl,
  rsiSeries,
  sessionVwap,
  smaSeries,
  stddevSeries,
} from "../src/lib/chart/indicatorMath.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** Floating point: compare to a tolerance, not with ===. */
function near(actual, expected, tolerance, message) {
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${message ?? "value"}: expected ~${expected}, got ${actual}`,
  );
}

const DAY = 86_400;
/** A candle with an explicit range, so ATR and VWAP have something to chew on. */
const candle = (i, close, { high, low, volume = 100 } = {}) => ({
  time: i * DAY,
  open: close,
  high: high ?? close,
  low: low ?? close,
  close,
  tickVolume: volume,
});

console.log("moving averages");

check("SMA of a ramp is the midpoint of its window", () => {
  // 1..10, period 4: the last window is 7,8,9,10 → 8.5.
  const values = Array.from({ length: 10 }, (_, i) => i + 1);
  const sma = smaSeries(values, 4);
  assert.equal(sma[0], null, "no average before the window is full");
  assert.equal(sma[2], null);
  near(sma[3], 2.5, 1e-12, "first full window");
  near(sma[9], 8.5, 1e-12, "last window");
});

check("a gap in the input is a gap in the average, and the line comes back", () => {
  // `values[i] ?? 0` missed NaN entirely, so one bad tick poisoned the running
  // sum and every later bar came out NaN — not a break in the line, a line
  // made of garbage. Measured on the old code: all seven outputs NaN.
  for (const hole of [Number.NaN, undefined]) {
    const sma = smaSeries([10, 10, hole, 10, 10, 10, 10], 3);
    assert.equal(sma[2], null, `a window containing ${String(hole)} has no average`);
    assert.equal(sma[3], null);
    assert.equal(sma[4], null);
    near(sma[5], 10, 1e-12, "and it recovers once the gap leaves the window");
    near(sma[6], 10, 1e-12);
    assert.ok(
      sma.every((v) => v === null || Number.isFinite(v)),
      "null means no value; NaN would be drawn as one",
    );
  }
});

check("EMA is seeded with the SMA and then follows the recurrence", () => {
  const values = [1, 2, 3, 4, 5, 6];
  const ema = emaSeries(values, 3);
  assert.equal(ema[1], null);
  near(ema[2], 2, 1e-12, "seed is the mean of the first three");
  // k = 2/(3+1) = 0.5 → next = 4*0.5 + 2*0.5 = 3
  near(ema[3], 3, 1e-12);
  near(ema[4], 4, 1e-12);
  near(ema[5], 5, 1e-12);
});

check("EMA skips leading nulls instead of poisoning the series", () => {
  // MACD's signal line is an EMA of a series whose first bars are null.
  const ema = emaSeries([null, null, 1, 2, 3, 4], 3);
  assert.equal(ema[3], null, "still only two real values here");
  near(ema[4], 2, 1e-12, "seeded from 1,2,3 once three exist");
  near(ema[5], 3, 1e-12);
});

check("a constant series has a constant average and no deviation", () => {
  const flat = Array(30).fill(42);
  near(smaSeries(flat, 20)[29], 42, 1e-12);
  near(emaSeries(flat, 20)[29], 42, 1e-12);
  near(stddevSeries(flat, 20)[29], 0, 1e-12);
});

console.log("\nbollinger");

check("zero variance collapses the bands onto the middle", () => {
  const bands = bollingerBands(Array(25).fill(100), 20, 2);
  const last = bands[24];
  near(last.middle, 100, 1e-12);
  near(last.upper, 100, 1e-12);
  near(last.lower, 100, 1e-12);
});

check("the bands sit a whole number of deviations from the middle", () => {
  const values = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
  const bands = bollingerBands(values, 20, 2);
  const dev = stddevSeries(values, 20)[39];
  near(bands[39].upper - bands[39].middle, 2 * dev, 1e-9);
  near(bands[39].middle - bands[39].lower, 2 * dev, 1e-9);
  // Population deviation, which is what TradingView's ta.stdev uses, so a
  // ±1 alternation around 100 has a deviation of exactly 1.
  near(dev, 1, 1e-9);
});

check("there are no bands before the window is full", () => {
  const bands = bollingerBands(Array.from({ length: 25 }, (_, i) => i), 20, 2);
  assert.equal(bands[18].upper, null);
  assert.equal(bands[18].middle, null);
  assert.ok(bands[19].upper != null);
});

console.log("\nrsi");

/**
 * Wilder's RSI written out longhand — a second implementation, so a typo in
 * the first does not agree with itself. Deliberately not sharing a line of
 * code with it.
 */
function rsiLonghand(values, period) {
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const d = values[i] - values[i - 1];
    if (d > 0) gains += d;
    if (d < 0) losses -= d;
  }
  let g = gains / period;
  let l = losses / period;
  const result = [g === 0 && l === 0 ? 50 : l === 0 ? 100 : 100 - 100 / (1 + g / l)];
  for (let i = period + 1; i < values.length; i += 1) {
    const d = values[i] - values[i - 1];
    g = (g * (period - 1) + Math.max(0, d)) / period;
    l = (l * (period - 1) + Math.max(0, -d)) / period;
    result.push(g === 0 && l === 0 ? 50 : l === 0 ? 100 : 100 - 100 / (1 + g / l));
  }
  return result;
}

check("RSI matches Wilder's recurrence computed independently", () => {
  // A series with both directions in it, so neither branch is untested.
  const values = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08,
    45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64,
    46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57,
  ];
  const mine = rsiSeries(values, 14);
  const longhand = rsiLonghand(values, 14);
  for (let i = 14; i < values.length; i += 1) {
    near(mine[i], longhand[i - 14], 1e-9, `bar ${i}`);
  }
  // And it lands where Wilder's published worked example does.
  near(mine[14], 70.46, 0.05, "Wilder's own example");
});

check("RSI has no value before it has a full period of changes", () => {
  const values = Array.from({ length: 20 }, (_, i) => 100 + i);
  const rsi = rsiSeries(values, 14);
  for (let i = 0; i < 14; i += 1) assert.equal(rsi[i], null, `bar ${i} should be null`);
  assert.ok(rsi[14] != null);
});

check("only-up is 100 and only-down is 0", () => {
  const up = rsiSeries(Array.from({ length: 30 }, (_, i) => 100 + i), 14);
  near(up[29], 100, 1e-9);
  const down = rsiSeries(Array.from({ length: 30 }, (_, i) => 200 - i), 14);
  near(down[29], 0, 1e-9);
});

check("a dead-flat series is neutral, not maximally overbought", () => {
  // `avgLoss === 0 ? 100` on its own said RSI 100 for a price that had not
  // moved: no losses. smartAlertRules fires on RSI, so this was an overbought
  // alert waiting to happen on any thin instrument out of hours.
  const flat = rsiSeries(Array(40).fill(1.2345), 14);
  near(flat[39], 50, 1e-9, "flat market");
  near(flat[14], 50, 1e-9, "including the very first reading");
});

check("alternating equal moves hold the midpoint and stay there", () => {
  // Seven gains of 1 and seven losses of 1 over the seed window → 50 exactly
  // at the first reading. After that Wilder's smoothing makes it breathe
  // around 50 rather than sit on it — the last bar is always a gain or a loss
  // and the average has not yet absorbed it — so the invariant is the band,
  // not the point. It stays inside a few points of neutral forever.
  const values = Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? 100 : 101));
  const rsi = rsiSeries(values, 14);
  near(rsi[14], 50, 1e-9, "first reading");
  for (let i = 14; i < values.length; i += 1) {
    assert.ok(
      Math.abs(rsi[i] - 50) < 4,
      `a market going nowhere must not drift to an extreme: bar ${i} read ${rsi[i]}`,
    );
  }
});

console.log("\nmacd");

check("MACD of a flat series is flat zero", () => {
  const macd = macdSeries(Array(80).fill(50));
  near(macd[79].macd, 0, 1e-9);
  near(macd[79].signal, 0, 1e-9);
  near(macd[79].histogram, 0, 1e-9);
});

check("the histogram is exactly MACD minus its signal", () => {
  const values = Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 7) * 5);
  for (const point of macdSeries(values)) {
    if (point.macd == null || point.signal == null) {
      assert.equal(point.histogram, null, "no histogram without both legs");
      continue;
    }
    near(point.histogram, point.macd - point.signal, 1e-12);
  }
});

check("a rising market puts the fast EMA above the slow one", () => {
  const macd = macdSeries(Array.from({ length: 120 }, (_, i) => 100 + i));
  assert.ok(macd[119].macd > 0, "fast EMA must lead a trend upward");
});

check("the signal line starts later than the MACD line", () => {
  const values = Array.from({ length: 60 }, (_, i) => 100 + i);
  const macd = macdSeries(values, 12, 26, 9);
  const firstMacd = macd.findIndex((p) => p.macd != null);
  const firstSignal = macd.findIndex((p) => p.signal != null);
  assert.equal(firstMacd, 25, "slow EMA seeds on its 26th value");
  assert.equal(firstSignal, 33, "and the signal needs nine of those");
});

console.log("\natr");

check("ATR of a constant range is that range", () => {
  // Every bar spans 2.0 and closes mid-bar, so true range is 2.0 throughout.
  const candles = Array.from({ length: 40 }, (_, i) =>
    candle(i, 100, { high: 101, low: 99 }),
  );
  near(atrSeries(candles, 14)[39], 2, 1e-9);
});

check("ATR counts the gap, not just the bar", () => {
  // Bar 1 opens a long way above bar 0's close: true range has to reach back
  // to the previous close or it understates the move.
  const candles = [candle(0, 100, { high: 100, low: 100 }), candle(1, 110, { high: 110, low: 109 })];
  const atr = atrSeries(candles, 1);
  near(atr[1], 10, 1e-9, "|high - prevClose| is the widest of the three");
});

check("ATR warms up with a cumulative average instead of a null", () => {
  const candles = Array.from({ length: 5 }, (_, i) => candle(i, 100, { high: 102, low: 100 }));
  const atr = atrSeries(candles, 14);
  assert.ok(atr.every((v) => Number.isFinite(v)), "callers must not have to handle nulls");
  near(atr[4], 2, 1e-9);
});

console.log("\nvwap");

check("VWAP is the volume-weighted mean of typical price", () => {
  const candles = [
    candle(0, 10, { high: 12, low: 8, volume: 1 }), // typical 10
    candle(0, 20, { high: 22, low: 18, volume: 3 }), // typical 20
  ];
  // (10*1 + 20*3) / 4 = 17.5
  near(sessionVwap(candles)[1], 17.5, 1e-12);
});

check("a bar with no ticks carries the line instead of breaking it", () => {
  // `continue` used to leave a null here, so one quiet bar mid-session split
  // the VWAP into two pieces on the chart and handed the alert rules a null
  // where a price belonged.
  const candles = [
    candle(0, 10, { high: 10, low: 10, volume: 5 }),
    candle(0, 11, { high: 11, low: 11, volume: 0 }),
    candle(0, 10, { high: 10, low: 10, volume: 5 }),
  ];
  const vwap = sessionVwap(candles);
  near(vwap[0], 10, 1e-12);
  near(vwap[1], 10, 1e-12, "unchanged, but present");
  near(vwap[2], 10, 1e-12);
});

check("VWAP restarts on a new day and forgets the old one", () => {
  const candles = [
    { ...candle(0, 10, { high: 10, low: 10, volume: 100 }), time: 0 },
    { ...candle(0, 50, { high: 50, low: 50, volume: 1 }), time: DAY + 3600 },
  ];
  const vwap = sessionVwap(candles);
  near(vwap[1], 50, 1e-12, "yesterday's volume must not weigh on today");
});

check("a session with no volume at all has no VWAP", () => {
  const candles = [candle(0, 10, { high: 10, low: 10, volume: 0 })];
  assert.equal(sessionVwap(candles)[0], null, "there is no average of nothing");
});

console.log("\nvolume point of control");

check("the POC lands on the price where the volume actually was", () => {
  const quiet = Array.from({ length: 20 }, (_, i) =>
    candle(i, 100, { high: 110, low: 90, volume: 1 }),
  );
  const heavy = Array.from({ length: 5 }, (_, i) =>
    candle(20 + i, 95, { high: 95.2, low: 94.8, volume: 10_000 }),
  );
  const poc = pointOfControl([...quiet, ...heavy], 100, 50);
  assert.ok(poc != null);
  near(poc.price, 95, 0.5, "the heavy cluster sits at 95");
});

check("no range and no volume mean no POC, not a made-up price", () => {
  assert.equal(pointOfControl([], 100, 50), null);
  assert.equal(
    pointOfControl([candle(0, 100, { high: 100, low: 100 })], 100, 50),
    null,
    "a zero-width range cannot be binned",
  );
  assert.equal(
    pointOfControl(
      Array.from({ length: 5 }, (_, i) => candle(i, 100, { high: 110, low: 90, volume: 0 })),
      100,
      50,
    ),
    null,
    "a range with no volume in it has no point of control",
  );
});


// ───────────────────────────────────────────────────────────────────────────────
// Where the trading day starts.
//
// Five things on the chart hung off this: session VWAP, the session open line,
// and Previous Day High / Low / Equilibrium. All five bucketed candles by UTC
// date, and all five were therefore wrong for FX — worst on Mondays, where
// "previous day" came out as Sunday evening's two-hour stub instead of
// Friday's full session.
// ───────────────────────────────────────────────────────────────────────────────

console.log("\nthe broker's trading day");

const sec = (iso) => Date.parse(iso) / 1000;

check("a broker's own shorthand resolves to a zone that observes DST", () => {
  assert.equal(resolveSessionZone("EET"), "Europe/Athens");
  assert.equal(resolveSessionZone("eet"), "Europe/Athens", "case must not matter");
  assert.equal(resolveSessionZone("EET/EEST"), "Europe/Athens");
  assert.equal(resolveSessionZone("EST"), "America/New_York");
  assert.equal(resolveSessionZone("UTC"), "UTC");
  // A fixed +02:00 would be an hour out for seven months of the year, which
  // is why these map to IANA zones and not to offsets.
  assert.ok(!/[+\-]\d\d:?\d\d/.test(resolveSessionZone("EET")));
});

check("an IANA zone passes through and nonsense falls back instead of throwing", () => {
  assert.equal(resolveSessionZone("Asia/Tokyo"), "Asia/Tokyo");
  assert.equal(resolveSessionZone(""), DEFAULT_SESSION_ZONE);
  assert.equal(resolveSessionZone(null), DEFAULT_SESSION_ZONE);
  assert.equal(resolveSessionZone(undefined), DEFAULT_SESSION_ZONE);
  assert.equal(
    resolveSessionZone("Mars/Olympus_Mons"),
    DEFAULT_SESSION_ZONE,
    "an unknown zone makes Intl throw — the chart must not blank out over it",
  );
});

check("the default is EET, because that is what MT5 brokers run", () => {
  assert.equal(DEFAULT_SESSION_ZONE, "Europe/Athens");
  // UTC is wrong for nearly every FX broker; EET is right for most.
  assert.notEqual(DEFAULT_SESSION_ZONE, "UTC");
});

check("Sunday's FX open belongs to Monday on the broker's day", () => {
  // 2026-10-18 is a Sunday. FX reopens at 21:00 UTC, which is 00:00 Monday in
  // Athens (EEST, UTC+3 until 25 October). Under a UTC key this candle was
  // its own day — and so Monday's "previous day" was this two-hour stub
  // rather than Friday.
  const sundayOpen = sec("2026-10-18T21:00:00Z");
  assert.equal(sessionDayKey(sundayOpen, "Europe/Athens"), "2026-10-19");
  assert.equal(sessionDayKey(sundayOpen, "UTC"), "2026-10-18", "the old behaviour, for contrast");
});

check("the boundary moves with the broker's DST, as a fixed offset could not", () => {
  // Athens is UTC+3 in summer and UTC+2 in winter, so the UTC instant that
  // starts a trading day is not the same instant all year.
  assert.equal(sessionDayKey(sec("2026-10-18T21:00:00Z"), "Europe/Athens"), "2026-10-19");
  // Same clock time in November, after EEST ends: still Sunday.
  assert.equal(sessionDayKey(sec("2026-11-15T21:00:00Z"), "Europe/Athens"), "2026-11-15");
  // An hour later it rolls.
  assert.equal(sessionDayKey(sec("2026-11-15T22:00:00Z"), "Europe/Athens"), "2026-11-16");
});

check("midnight and the last second of a day land on the right side", () => {
  assert.equal(sessionDayKey(sec("2026-11-16T22:00:00Z"), "Europe/Athens"), "2026-11-17");
  assert.equal(sessionDayKey(sec("2026-11-16T21:59:59Z"), "Europe/Athens"), "2026-11-16");
});

check("a candle with a broken timestamp does not join today", () => {
  assert.equal(sessionDayKey(Number.NaN, "Europe/Athens"), "");
  assert.equal(sessionDayKey(Number.POSITIVE_INFINITY, "Europe/Athens"), "");
});

check("VWAP keeps Sunday's open in Monday's session on the broker's day", () => {
  const candles = [
    // Friday afternoon — a different session either way.
    { ...candle(0, 100, { high: 100, low: 100, volume: 10 }), time: sec("2026-10-16T14:00:00Z") },
    // Sunday 21:00 UTC: Monday 00:00 in Athens.
    { ...candle(0, 200, { high: 200, low: 200, volume: 10 }), time: sec("2026-10-18T21:00:00Z") },
    // Monday morning.
    { ...candle(0, 300, { high: 300, low: 300, volume: 10 }), time: sec("2026-10-19T06:00:00Z") },
  ];

  const broker = sessionVwap(candles, "Europe/Athens");
  near(broker[2], 250, 1e-9, "Sunday's open and Monday morning are one session: (200+300)/2");

  const utc = sessionVwap(candles, "UTC");
  near(utc[2], 300, 1e-9, "under UTC, Monday morning starts from nothing — the old behaviour");
});

check("the chart layer uses one trading day for all five overlays", () => {
  const layer = readFileSync("src/components/chart/indicators/ChartIndicatorLayer.tsx", "utf8");
  assert.ok(
    !/utcDateKey/.test(layer),
    "session open and the previous-day levels had their own UTC bucketing",
  );
  assert.ok(/sessionDayKey\(candle\.time, timeZone\)/.test(layer));
  assert.ok(/sessionVwap\(mathCandles, sessionZone\)/.test(layer));
  assert.ok(
    /pal, sessionZone\]/.test(layer),
    "the zone must be a memo dependency or an account switch keeps the old day",
  );
  const math = readFileSync("src/lib/chart/indicatorMath.ts", "utf8");
  assert.ok(!/utcSessionKey/.test(math), "VWAP had a second copy of the same wrong boundary");
});

check("the broker timezone is stored for every account, not just new brokers", () => {
  const connect = readFileSync("src/app/actions/mt5Cloud.ts", "utf8");
  assert.ok(
    !/\? \{ provisioningProfileId, brokerTimezone \}/.test(connect),
    "it used to be saved only alongside a provisioning profile, so known brokers had none",
  );
  const loader = readFileSync("src/lib/broker/loadChartPageData.ts", "utf8");
  assert.ok(/brokerTimezone: brokerTz/.test(loader), "and the chart has to be able to read it");
  const screen = readFileSync("src/components/chart/ChartScreen.tsx", "utf8");
  assert.ok(/brokerTimezone=\{data\.account\?\.brokerTimezone/.test(screen));
});

console.log("\nsingle source of truth");

check("nothing re-implements this maths somewhere else", () => {
  // Two RSIs in one codebase drift, and the one feeding the alerts is the one
  // nobody is looking at.
  const sources = [
    "src/components/chart/indicators/ChartIndicatorLayer.tsx",
    "src/components/chart/indicators/IndicatorPane.tsx",
    "src/lib/alerts/smartAlertRules.ts",
  ];
  for (const path of sources) {
    const src = readFileSync(path, "utf8");
    assert.ok(
      !/100 - 100 \/ \(1 \+/.test(src),
      `${path} has its own RSI formula — it must read indicatorMath instead`,
    );
  }
  const alerts = readFileSync("src/lib/alerts/smartAlertRules.ts", "utf8");
  assert.ok(/indicatorMath/.test(alerts), "the alert rules must score on the same numbers the chart draws");
});

console.log(`\n${passed} checks passed`);
