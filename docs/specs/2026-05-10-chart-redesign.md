# AXE Companion — chart redesign

**Date:** 2026-05-10
**Status:** Design — pending user sign-off
**Mockup:** `tmp/AXE-COMPANION-OS/docs/mockups/axe-chart-redesign.html`

---

## Goal

Make the AXE Companion chart feel native — MT5 / TradingView quality on a phone-sized canvas — by:

1. Splitting the right rail into a clean two-rail layout (left = previous-day context, right = fib levels and prices).
2. Replacing the half-baked "Premium / Discount fib mode" with a real Supply / Demand indicator, anchored to the active timeframe's most recent swing High / Low.
3. Locking the auto-fib visual to a constant 3-bar width before the live candle, with explicit "extend left" and "extend right" toggles for traders who want a wider visual.
4. Fixing iFVG behaviour so the detected box keeps its dimensions when polarity flips, and extends right with the same 1 / 2 / 3 per-side selector that Order Blocks use.
5. Separating market execution (Buy / Sell · MKT) from pending order entry (Limit / Stop with a dedicated `Set ▶` arrow), eliminating the foot-gun where a misclick on Buy fires a market when the trader meant a limit.
6. Adding a second sliding tool rail for analytical indicators (VOL · MA · MACD · BOL · RSI · VWAP · POC), separate from the SMC tool rail that already exists.

## Non-goals

- No changes to data plumbing (MetaApi candle stream, Polygon news, Supabase persistence).
- No changes to alerts, push notifications, or the demo / live trading flag.
- No new chart types (still candles only).
- No multi-anchor VWAP yet (single session-anchored default).

---

## Affected files

| File | Role |
|---|---|
| `src/components/chart/ChartScreen.tsx` | State, toolbar, order strip, fib mode plumbing |
| `src/components/chart/indicators/ChartIndicatorLayer.tsx` | OB / FVG / iFVG / PDH / PDL / PDQ rendering |
| `src/components/chart/indicators/IndicatorPane.tsx` | Bottom panes (currently VOL + RSI; will add MACD) |
| `src/components/chart/annotations/FibAnnotationLayer.tsx` | Fib level rendering + drag |
| `src/lib/axeChartActions/swingAnalysis.ts` | Auto-fib anchor detection |
| `src/components/chart/ChartOrderConfirm.tsx` | Live-order confirm modal (no contract change) |
| `src/app/api/mt5/order/route.ts` | Order API — no change, already supports pending types |

New files:

| File | Role |
|---|---|
| `src/components/chart/indicators/SupplyDemandLayer.tsx` | Renders Supply / Demand bands + EQ |
| `src/components/chart/indicators/BollingerBandsLayer.tsx` | Renders Bollinger Bands overlay |
| `src/components/chart/indicators/VwapLayer.tsx` | Renders session-VWAP line + label |
| `src/components/chart/indicators/PointOfControlLayer.tsx` | Renders POC horizontal line + value-area labels |
| `src/components/chart/indicators/MacdPane.tsx` | MACD oscillator pane |
| `src/lib/chart/indicatorMath.ts` | Shared math: stddev, EMA, volume profile |

---

## Detailed design

### 1. Two-rail label layout

| Rail | Lives there | Anchor X |
|---|---|---|
| **Left rail** | PDH, PDL, PDQ, Supply / Demand band labels | `LEFT_RAIL_OFFSET = 8` |
| **Right rail** | Fib %, fib price, OB volume + dominance, iFVG / FVG labels (same as today) | `RIGHT_RAIL_OFFSET = 8` (already shipped) |

Render rules:
- PDH / PDL / PDQ lines run from the **left label** to `containerWidth - RIGHT_RAIL_OFFSET`. The label sits flush left, the line extends right across the candle area.
- Supply / Demand band labels (`SUPPLY`, `DEMAND`, `EQ`) sit on the left rail at the band's vertical centre.
- All right-rail labels stay where they are today.

`LEFT_RAIL_OFFSET` is a new shared constant defined alongside `RIGHT_RAIL_OFFSET` in `ChartIndicatorLayer.tsx`. Both are imported by any layer that anchors text on a rail.

### 2. Auto-fib visual clamp + toggles

`FibAnnotationLayer` adds a fixed 3-bar clamp on the LEFT side of the rendered fib lines. The 0 % / 100 % anchors are still picked from the actual swing data — only the visible segment is clamped.

```
default:     [3 bars before live] ──────────── [right rail]
extend left:    [chart left edge] ──────────── [right rail]
extend right (already wired via projection cursor)
```

- New per-fib annotation setting: `extendLeft: boolean` (default false).
- Existing `extendRight: boolean` stays as-is.
- New constant `LEFT_VISUAL_BARS = 3` in `FibAnnotationLayer.tsx`.
- The fib's `startX` becomes `Math.max(swingAnchorX, lastCandleX - LEFT_VISUAL_BARS * barWidth)` unless `extendLeft` is on.

Toolbar: when a fib is active, the existing "Fib · source" picker grows two small toggle pills next to it: `← extend` and `extend →`. Tap to toggle. Persisted on the annotation, not in localStorage (so each fib remembers its own state).

The old `pd_band` fib mode is **deleted** — that visualisation lives in the new Supply / Demand indicator now.

### 3. Supply / Demand as a standalone indicator

`SupplyDemandLayer.tsx`:
- Detects the **latest swing High** and **latest swing Low** on the active timeframe using the same pivot algorithm (`strength = 5`) as the Swings overlay.
- `range = swingHigh.price - swingLow.price`
- `supplyTop = swingHigh.price`
- `supplyBottom = swingHigh.price - range * 0.25`
- `demandTop = swingLow.price + range * 0.25`
- `demandBottom = swingLow.price`
- `eqPrice = (swingHigh.price + swingLow.price) / 2`

Renders:
- Faint red zone (top 25 %), faint emerald zone (bottom 25 %), thin dashed grey EQ midline.
- Right-rail labels: `SUPPLY`, `DEMAND`, `EQ`.
- Left-rail labels: just the indicator's own band labels (anchored on the left rail per §1).
- Z-index sits **below** OB / FVG / iFVG so the SMC zones still pop.

Toolbar entry: new `S/D` pill in the SMC tool rail (next to PDQ).

Data source: shares the swing-pivot detection in `ChartIndicatorLayer` via a small extracted helper in `src/lib/chart/swingPivots.ts` (extract from existing inline logic — no behaviour change).

### 4. Fib mode `S/D`

Adds a fourth fib source to the existing picker: `Auto · Swing · Day · S/D`.

When the user picks `S/D`:
- 0 % anchor = `supplyTop` (latest swing High)
- 100 % anchor = `demandBottom` (latest swing Low)

Geometry-wise this is a superset of `Swing` mode, but the explicit option is convenient because the user can have S/D rendered on the chart and the fib auto-snapped to it without reasoning about which swing detection is active.

### 5. iFVG behaviour

- The detected box keeps **the same width and height** when polarity flips (cyan ↔ red). Today it already keeps height (gap top / bottom), but the rendered width is the source-FVG range; we'll preserve `width` and `detectionEndX` of the source FVG when constructing the iFVG so a flipped iFVG visually replaces the original FVG box exactly.
- Right-extend uses the same forward-projection logic as Order Blocks — `extend` flag, dashed top + bottom rays, capped at the projection cursor or chart frame edge.
- Adds the `inverseFvgCount` UI parity: 1 / 2 / 3 per-side selector already exists, just verify it works with the new size-preserving box.

Verification path: walk through `buildInverseFvgs` and replace the dynamic `width` calculation with `originalFvg.width` so a small iFVG never collapses next to its larger predecessor.

### 6. Volumetric OB confirmation

Already shipping (`VolumetricSplitFill` + `VolumetricRightRailLabel`). User reports they don't see the labels. Likely causes:

| Cause | Fix |
|---|---|
| `tickVolume` is null on the candle stream | Inspect `MetaApiCandle` payload server-side. Fall back to `volume` if present (already done). |
| OB band height < 12 px | Currently we hide the label to avoid clutter on tiny zones. Lower the threshold to 8 px and keep it. |
| `totalChartVolume === 0` | Means none of the last 200 candles reported volume. Fall back to the OB's own `totalVolume` and show the absolute value without the % suffix (e.g. `1.08K` instead of `1.08K (13%)`). |

All three fixes ship in this redesign.

### 7. Order entry refactor

State changes in `ChartScreen.tsx`:
- Split the existing `pendingOrderType` into `executionMode: "market" | "pending"`.
- `pending` keeps the four sub-types: `buy_limit` | `sell_limit` | `buy_stop` | `sell_stop`.
- `pendingOrderVisible` only flips true when `executionMode === "pending"`.

UI changes:
- The bottom strip now has TWO rows:
  - **Row 1** (always visible): `SELL · MKT` (rose), lots, `BUY · MKT` (cyan). Both fire markets only.
  - **Row 2** (visible when `executionMode === "pending"`): the order-type tag (e.g. `BUY LIMIT`), price text, `SL` toggle, `TP` toggle, and the gold `Set ▶` arrow.
- The order-type picker (the small dropdown) moves to a single-row chip above the strip. Tapping `Buy Limit` flips `executionMode` to `pending` AND sets `pendingOrderType` in one go. Tapping `Market` flips `executionMode` to `market` and hides Row 2.
- `SL` / `TP` buttons in Row 2 toggle their respective dashed lines on / off (tap to add, tap again to remove). Same draggable behaviour as today.
- Pressing `Set ▶` calls the existing `handleSendCurrentPlan` pipeline. Pressing `BUY · MKT` or `SELL · MKT` skips the pending lines and fires a market via the same pipeline with `openPrice: null`.

This guarantees: **market orders cannot fire from the pending row, and pending orders cannot fire from the market row.**

### 8. Second tool rail — Indicators

Layout: stacks below the existing SMC tool rail on the left side of the chart. Same drawer / collapse behaviour as the current rail. Expand handle at the top of the rail toggles "Indicators" panel open / closed.

Entries (in order):

| ID | Label | Renders | Default |
|---|---|---|---|
| `vol` | VOL | Bottom pane | (already shipping) |
| `ma` | MA | Main chart overlay | 20-period SMA (already shipping) |
| `macd` | MACD | New bottom pane | 12 / 26 / 9 |
| `bol` | BOL | Main chart overlay | 20-period SMA, ±2σ |
| `rsi` | RSI | Bottom pane | 14-period (already shipping) |
| `vwap` | VWAP | Main chart overlay | Session VWAP, resets at 00:00 UTC |
| `poc` | POC | Main chart overlay | Last 100 bars volume profile, single horizontal line at peak-volume bin |

VOL / MA / RSI move from the SMC rail to the new rail (no duplicates).

#### Math reference

- **MA** (SMA): `Σ close[i-N+1..i] / N`
- **BOL**: `mid = SMA(close, 20); upper = mid + 2 * stddev(close, 20); lower = mid - 2 * stddev(close, 20)`
- **VWAP**: `Σ(price[i] * volume[i]) / Σ volume[i]`, resets at 00:00 UTC. `price = (high + low + close) / 3`.
- **MACD**: `macd = EMA(close, 12) - EMA(close, 26); signal = EMA(macd, 9); hist = macd - signal`
- **POC**: build a 50-bin price histogram across the last 100 bars, weighting each bar's `tickVolume` evenly across its high → low range. POC = bin midpoint of the bin with the highest weight.

All math lives in `src/lib/chart/indicatorMath.ts` so it's testable in isolation.

#### Pane stacking

Three panes max (VOL, RSI, MACD). On a small mobile screen all three at once is too much, so:
- Each pane has a default height (60 px on phones, 90 px on tablets) — already enforced via `axe.chart.paneHeight.*` localStorage keys.
- The main chart is hard-floored at 50 % of the viewport height. When the sum of active pane heights exceeds the remaining space, the pane stack itself becomes vertically scrollable (`overflow-y: auto` on the stack container). The chart never shrinks past the floor.

---

## Implementation phases

To keep PRs reviewable on a phone and bisectable, ship this in five phases:

### Phase 1 — Two-rail labels + fib clamp + extend toggles (no new indicators)

- Add `LEFT_RAIL_OFFSET` constant.
- Move PDH / PDL / PDQ line + label to the left rail.
- Clamp fib `startX` to `lastCandleX - 3 * barWidth` unless `extendLeft` is on.
- Add per-fib `extendLeft` / `extendRight` toggle pills in the toolbar.
- Keep the `pd_band` fib mode functional in this phase (it'll still render the old half-half tint) so users aren't left without a P/D visual between Phase 1 and Phase 2 ship dates. Phase 2 deletes it once Supply / Demand is live.

### Phase 2 — Supply / Demand indicator + fib S/D mode + volumetric label fixes

- Extract swing-pivot helper to `src/lib/chart/swingPivots.ts`.
- Add `SupplyDemandLayer.tsx`.
- Add `S/D` pill to the SMC tool rail.
- Add `S/D` option to fib source picker.
- Delete the now-redundant `pd_band` fib mode (Supply / Demand replaces it).
- Lower the volumetric label height threshold to 8 px and add the `totalChartVolume === 0` fallback.

### Phase 3 — iFVG box-size parity + count selector verification

- Capture the source FVG width when building an iFVG so the polarity-flip box is identical in size.
- Verify the existing `inverseFvgCount` selector still produces the right N per side.
- No behavioural change to FVG itself.

### Phase 4 — Order entry refactor

- Add `executionMode` state.
- Refactor the bottom strip into Row 1 (market) + Row 2 (pending) with the gold `Set ▶`.
- Order-type chip flips `executionMode` automatically when selecting a pending type.
- Wire `Set ▶` to the existing `handleSendCurrentPlan`.
- Update aria labels + on-screen copy so screen readers can distinguish the two execution modes.

### Phase 5 — Second tool rail with new analytical indicators

- Add `src/lib/chart/indicatorMath.ts` (SMA, EMA, stddev, VWAP, MACD, volume profile).
- Add the four new layers (Bollinger, VWAP, POC, MACD pane).
- Build the second sliding tool rail in `ChartScreen.tsx`. Move `vol` / `ma` / `rsi` to the new rail, leave SMC tools where they are.
- Persist a separate set of `activeToolFlags` for the indicator rail under `axe.chart.indicatorFlags` localStorage key so the SMC rail and the indicator rail can be toggled independently on different devices.

Each phase is a single PR. Phase 1 lands first; user verifies on device before phase 2 starts.

---

## Risks

- **Left-rail collisions** with structure labels (`I-CHoCH`, `I-BoS`, `1DH`). Mitigation: structure labels already render in their own SVG `<text>` group; we'll bump PDH / PDL / PDQ labels to a dedicated layer ABOVE structure labels, with a light text shadow (`stroke="rgba(0,0,0,0.78)" strokeWidth=2.6 paintOrder="stroke"`) so they read on any background. If a real collision shows up on the device test, we add a 14 px vertical nudge based on the structure label set — but I expect this not to be needed.
- **VWAP session boundary.** "Today's UTC midnight" is the simplest definition and matches what most retail platforms call "session VWAP". Forex traders sometimes prefer the New York 17:00 ET futures-session reset. If the user wants that later, we add a small sub-toggle inside the indicator panel without a refactor.
- **POC volume bin count.** 50 bins × 100 bars is fine for FX / crypto on mobile (sub-millisecond compute). For symbols with extreme volatility (NQ futures, BTC daily) the bins might be too coarse — easy fix later by making the bin count adaptive to ATR.
- **Three panes at once** can squeeze the main chart on small phones. Soft scroll + persisted heights handles it; if it still feels cramped on the device, we collapse pane-2 by default.

## Out of scope (later)

- Anchored VWAP (drag a point, VWAP starts there).
- Volume profile sidebar (full histogram on the left rail).
- Multi-leg fib drawing (lots of fibs at once with a stacked sidebar).
- Chart type switcher (Heikin-Ashi, Renko, line).
