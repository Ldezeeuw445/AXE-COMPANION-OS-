"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";
import {
  bollingerBands,
  pointOfControl,
  sessionVwap,
  atrSeries,
  smaSeries,
  emaSeries,
  type IndicatorMathCandle,
} from "@/lib/chart/indicatorMath";

/**
 * Shared right-rail offset. Right-rail labels (OB volume, fib %, fib
 * price, iFVG / FVG counts) anchor at `containerWidth - RIGHT_RAIL_OFFSET`
 * so the entire right column lines up vertically with no overlap.
 * Mirrors `RIGHT_RAIL_OFFSET` in `FibAnnotationLayer.tsx`.
 */
const RIGHT_RAIL_OFFSET = 8;

/**
 * Mirror of {@link RIGHT_RAIL_OFFSET} for the LEFT rail. Used for
 * previous-day context labels (PDH / PDL / PDQ, and later the Supply /
 * Demand band labels). Lines drawn between rails span
 * `[LEFT_RAIL_OFFSET, containerWidth - RIGHT_RAIL_OFFSET]` so they
 * never overlap fib percentages or price labels on the right.
 */
const LEFT_RAIL_OFFSET = 8;

type Props = {
  candles: MetaApiCandle[];
  canvasRef: React.RefObject<ChartCanvasHandle | null>;
  active: {
    ma?: boolean;
    bollinger?: boolean;
    vwap?: boolean;
    poc?: boolean;
    structure?: boolean;
    orderBlocks?: boolean;
    /** Auto Fair Value Gap zones (bullish + bearish, latest N per side). */
    fvg?: boolean;
    /** Inverse FVG: gaps that have been broken/inverted by later price. */
    ifvg?: boolean;
    /** Previous Day High — thin horizontal line. */
    pdh?: boolean;
    /** Previous Day Low — thin horizontal line. */
    pdl?: boolean;
    /** Previous Day Equilibrium — midpoint of yesterday's H+L. */
    pdq?: boolean;
    /** Compact swing high/low levels used as Fib anchor references. */
    swingPoints?: boolean;
    /**
     * Supply / Demand zones derived from the latest swing High / Low
     * on the active timeframe. Renders the top 25% of the swing range
     * as a faint Supply band, the bottom 25% as a Demand band, plus an
     * "EQ" midline. The fib `S/D` mode anchors itself to the same swing
     * H/L so band edges and fib 0%/100% line up exactly.
     */
    supplyDemand?: boolean;
  };
  /**
   * How many of the most recent bullish + bearish order blocks to render.
   * Defaults to 1 of each (cleanest), but the user can bump this to 2 or 3
   * via the toolbar picker when they want a wider context.
   */
  orderBlockCount?: 1 | 2 | 3;
  /** Same idea for iFVGs: how many of the most recent up + down inverse FVGs. */
  inverseFvgCount?: 1 | 2 | 3;
  /** Latest N bullish + N bearish raw FVGs. Default 1. */
  fvgCount?: 1 | 2 | 3;
  /**
   * Future-projection cursor X (chart-frame coords). When provided, the
   * iFVG / FVG / OB extensions stretch right to this X so the user can see
   * exactly when the next candles will hit the zone.
   */
  futureProjectionX?: number | null;
  /**
   * How many of each indicator (OB / FVG / iFVG) get the right-side
   * extension when the projection cursor is on. 1 = only the latest of
   * each side, 2 / 3 = the latest two / three. Defaults to 1 (cleanest).
   * When the cursor is OFF, every visible zone still gets a soft 4-bar
   * extension (the previous default), independent of this setting.
   */
  projectionCount?: 1 | 2 | 3;
  /** Moving Average period — SMA or EMA. Default 20. */
  maPeriod?: number;
  /** Moving Average type — "sma" or "ema". Default "sma". */
  maType?: "sma" | "ema";
  /** Dark theme? Paper mode needs much darker overlay colors. */
  isDark?: boolean;
};

type Size = { w: number; h: number };
type Point = { x: number; y: number };
type IndicatorCandle = {
  time: number | null;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume: number | null;
  volume: number | null;
};
type StructurePivot = { index: number; time: number; price: number; kind: "high" | "low" };
type StructureLabel = { x: number; y: number; label: string; kind: "high" | "low" };
type StructureLine = { x1: number; x2: number; y: number; label: string; bullish: boolean; continuation: boolean };
type SwingPointLevel = { x1: number; x2: number; y: number; kind: "high" | "low"; label: string };
type PointOfControlGeom = { y: number; price: number; volume: number } | null;
/**
 * A "zone" is a horizontal band rendered on the chart (OB, FVG, iFVG).
 * Both the price-domain and pixel-domain are kept so we can compute
 * derived geometry like midlines or volume profiles cleanly.
 */
type Zone = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Pixel X of the projected right edge (≥ x + width). Used for extensions. */
  extendX: number;
  /** Original detected end X (kept dashed for iFVG so the user sees the source). */
  detectionEndX: number;
  midY: number;
  stroke: string;
  fill: string;
  /**
   * "up" = bullish-OB / bullish-FVG-gap-up,
   * "down" = bearish-OB / bearish-FVG-gap-down.
   * Used by the OB count filter so we keep the latest N per direction
   * instead of just the latest N regardless of side.
   */
  direction: "up" | "down";
  /** True when the inner fill should bleed past detectionEndX without a stroke. */
  extend: boolean;
  /** True when this zone was reclaimed/mitigated and should fade out instead. */
  mitigated: boolean;
  /** Volume profile bars to render on the left edge (only OB has these). */
  volumeProfile?: VolumeProfileBar[];
  /** Buyer / seller volume split inside the zone (OB only). */
  volumetric?: VolumetricBreakdown;
  /**
   * Pixel X of the candle that inverted the source FVG (iFVG only).
   * The renderer splits the box here: left half keeps the original FVG
   * colour, right half is the inverted colour — matches the LuxAlgo
   * "Inversion Fair Value Gaps" reference visual.
   */
  inversionX?: number;
  /**
   * Direction of the source FVG *before* it flipped polarity (iFVG only).
   * "up" = bullish FVG (now inverted to bearish resistance),
   * "down" = bearish FVG (now inverted to bullish support).
   * Used by the renderer to colour the left half (= original FVG colour).
   */
  originalDirection?: "up" | "down";
};
type VolumeProfileBar = { y: number; height: number; widthFraction: number };
type StructureArrow = { x: number; y: number; label: string; bullish: boolean };

/**
 * Volumetric breakdown attached to each Order Block. Buyer = total
 * tickVolume traded by green-body candles overlapping the OB band,
 * Seller = total tickVolume from red-body candles. The render layer
 * uses these to draw a small split bar inside the OB, LuxAlgo-style:
 * green = buyer share, red = seller share. Lets the trader see at a
 * glance whether buyers or sellers had the upper hand inside the zone.
 */
type VolumetricBreakdown = {
  buyerVolume: number;
  sellerVolume: number;
  totalVolume: number;
  buyerPercent: number;
  sellerPercent: number;
};

/**
 * Extra pixel breathing room past the most recent candle for iFVG / OB
 * extensions when the future-projection cursor isn't set. Matches the
 * trader's "5 bars in front" mental model — sized via the loaded series'
 * average spacing instead of a hard-coded number of pixels.
 */
const MIN_FUTURE_BARS = 5;

/* ── Overlay color palette ─────────────────────────────────────
 * Same hues for both themes; Paper variants are much darker so
 * overlays stay legible on the warm #d7d6d0 background.
 * Text strokes swap from black (Midnight) to the Paper bg so
 * labels pop equally on both surfaces.
 */
function overlayPalette(dark: boolean) {
  if (dark) {
    return {
      textStroke06: "rgba(0,0,0,0.60)",
      textStroke07: "rgba(0,0,0,0.65)",
      textStroke08: "rgba(0,0,0,0.70)",
      textStroke09: "rgba(0,0,0,0.76)",
      textStroke10: "rgba(0,0,0,0.78)",
      textStroke11: "rgba(0,0,0,0.82)",
      pdhStroke: "rgba(34,211,238,0.92)", pdhLabel: "rgba(125,235,255,0.98)",
      pdlStroke: "rgba(244,63,94,0.92)", pdlLabel: "rgba(252,165,165,0.98)",
      pdqStroke: "rgba(96,165,250,0.88)", pdqLabel: "rgba(186,212,255,0.98)",
      structBullLine: "rgba(8,153,129,0.90)", structBullText: "rgba(8,153,129,0.95)",
      structBearLine: "rgba(242,54,69,0.90)", structBearText: "rgba(242,54,69,0.95)",
      pivotHigh: "rgba(34,211,238,0.88)", pivotLow: "rgba(45,212,191,0.88)",
      sfpBull: "rgba(8,153,129,0.95)", sfpBear: "rgba(242,54,69,0.95)",
      swingHighStroke: "rgba(244,63,94,0.85)", swingHighFill: "rgba(244,63,94,0.98)",
      swingLowStroke: "rgba(45,212,191,0.85)", swingLowFill: "rgba(45,212,191,0.98)",
      maLine: "rgba(96,165,250,0.95)", maLabel: "rgba(96,165,250,0.95)",
      bolFill: "rgba(34,211,238,0.10)", bolBand: "rgba(34,211,238,0.65)", bolMid: "rgba(96,165,250,0.55)",
      vwapLine: "rgba(250,204,21,0.95)", vwapLabel: "rgba(250,204,21,0.95)",
      pocStroke: "rgba(168,85,247,0.92)", pocLabel: "rgba(216,180,254,0.98)",
      supplyFill: "rgba(244,63,94,0.12)", supplyStroke: "rgba(244,63,94,0.50)", supplyLabel: "rgba(252,165,165,0.95)",
      demandFill: "rgba(45,212,191,0.12)", demandStroke: "rgba(45,212,191,0.50)", demandLabel: "rgba(167,243,208,0.95)",
      eqStroke: "rgba(148,163,184,0.70)", eqLabel: "rgba(148,163,184,0.95)",
      obUpSource: "rgba(45,212,191,0.38)", obUpExt: "rgba(45,212,191,0.22)", obUpStroke: "rgba(45,212,191,0.88)",
      obDownSource: "rgba(239,68,68,0.38)", obDownExt: "rgba(239,68,68,0.22)", obDownStroke: "rgba(239,68,68,0.88)",
      obLabelUp: "rgba(167,243,208,0.82)", obLabelDown: "rgba(252,165,165,0.82)",
      obVolLabelUp: "rgba(167,243,208,0.90)", obVolLabelDown: "rgba(252,165,165,0.90)",
      sellerBar: "rgba(244,63,94,0.72)", buyerBar: "rgba(45,212,191,0.72)",
      fvgUpStroke: "rgba(96,165,250,0.98)", fvgUpFill: "rgba(96,165,250,0.38)",
      fvgDownStroke: "rgba(217,119,6,0.98)", fvgDownFill: "rgba(217,119,6,0.38)",
      fvgLabelUp: "rgba(96,165,250,0.90)", fvgLabelDown: "rgba(217,119,6,0.90)",
      ifvgBullOrig: "rgba(8,153,129,0.38)", ifvgBearOrig: "rgba(242,54,69,0.38)",
      ifvgBullStroke: "rgba(8,153,129,0.98)", ifvgBearStroke: "rgba(242,54,69,0.98)",
      ifvgMidline: "rgba(120,123,134,0.78)",
    };
  }
  return {
    textStroke06: "rgba(215,214,208,0.70)",
    textStroke07: "rgba(215,214,208,0.75)",
    textStroke08: "rgba(215,214,208,0.80)",
    textStroke09: "rgba(215,214,208,0.85)",
    textStroke10: "rgba(215,214,208,0.88)",
    textStroke11: "rgba(215,214,208,0.90)",
    pdhStroke: "rgba(0,100,120,0.95)", pdhLabel: "rgba(0,80,100,0.98)",
    pdlStroke: "rgba(150,18,35,0.95)", pdlLabel: "rgba(120,10,25,0.98)",
    pdqStroke: "rgba(30,70,150,0.95)", pdqLabel: "rgba(20,50,120,0.98)",
    structBullLine: "rgba(0,90,70,0.95)", structBullText: "rgba(0,80,60,0.98)",
    structBearLine: "rgba(150,18,25,0.95)", structBearText: "rgba(130,10,20,0.98)",
    pivotHigh: "rgba(0,90,110,0.95)", pivotLow: "rgba(0,100,85,0.95)",
    sfpBull: "rgba(0,80,60,0.98)", sfpBear: "rgba(130,10,20,0.98)",
    swingHighStroke: "rgba(150,18,35,0.88)", swingHighFill: "rgba(130,10,25,0.98)",
    swingLowStroke: "rgba(0,100,85,0.88)", swingLowFill: "rgba(0,90,70,0.98)",
    maLine: "rgba(30,70,150,0.98)", maLabel: "rgba(20,50,120,0.98)",
    bolFill: "rgba(0,100,120,0.10)", bolBand: "rgba(0,90,110,0.72)", bolMid: "rgba(30,70,150,0.60)",
    vwapLine: "rgba(160,110,0,0.98)", vwapLabel: "rgba(140,95,0,0.98)",
    pocStroke: "rgba(90,30,160,0.95)", pocLabel: "rgba(70,20,130,0.98)",
    supplyFill: "rgba(150,18,35,0.14)", supplyStroke: "rgba(150,18,35,0.55)", supplyLabel: "rgba(130,10,25,0.95)",
    demandFill: "rgba(0,100,85,0.14)", demandStroke: "rgba(0,100,85,0.55)", demandLabel: "rgba(0,80,65,0.95)",
    eqStroke: "rgba(50,55,65,0.72)", eqLabel: "rgba(40,45,55,0.95)",
    obUpSource: "rgba(0,100,85,0.42)", obUpExt: "rgba(0,100,85,0.26)", obUpStroke: "rgba(0,90,70,0.90)",
    obDownSource: "rgba(150,18,18,0.42)", obDownExt: "rgba(150,18,18,0.26)", obDownStroke: "rgba(140,10,10,0.90)",
    obLabelUp: "rgba(0,80,65,0.90)", obLabelDown: "rgba(130,10,25,0.90)",
    obVolLabelUp: "rgba(0,80,65,0.95)", obVolLabelDown: "rgba(130,10,25,0.95)",
    sellerBar: "rgba(150,18,35,0.75)", buyerBar: "rgba(0,100,85,0.75)",
    fvgUpStroke: "rgba(30,70,150,0.98)", fvgUpFill: "rgba(30,70,150,0.38)",
    fvgDownStroke: "rgba(160,90,0,0.98)", fvgDownFill: "rgba(160,90,0,0.38)",
    fvgLabelUp: "rgba(30,70,150,0.90)", fvgLabelDown: "rgba(160,90,0,0.90)",
    ifvgBullOrig: "rgba(0,90,70,0.38)", ifvgBearOrig: "rgba(150,18,25,0.38)",
    ifvgBullStroke: "rgba(0,90,70,0.98)", ifvgBearStroke: "rgba(150,18,25,0.98)",
    ifvgMidline: "rgba(50,55,65,0.78)",
  };
}

type OverlayPalette = ReturnType<typeof overlayPalette>;

export function ChartIndicatorLayer({
  candles,
  canvasRef,
  active,
  orderBlockCount = 1,
  inverseFvgCount = 1,
  fvgCount = 1,
  projectionCount = 1,
  futureProjectionX = null,
  maPeriod = 20,
  maType = "sma",
  isDark = true,
}: Props) {
  const pal = useMemo(() => overlayPalette(isDark), [isDark]);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    setSize({ w: rect.width, h: rect.height });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const handle = canvasRef.current;
    if (!handle) return;
    return handle.subscribeViewport(() => setVersion((v) => v + 1));
  }, [canvasRef]);

  const geometry = useMemo(() => {
    void version;
    const handle = canvasRef.current;
    if (!handle || size.w <= 0 || size.h <= 0) {
      return {
        maPath: "",
        latestMaY: null as number | null,
        bollingerUpperPath: "",
        bollingerMiddlePath: "",
        bollingerLowerPath: "",
        bollingerFillPath: "",
        vwapPath: "",
        latestVwap: null as number | null,
        latestVwapY: null as number | null,
        poc: null as PointOfControlGeom,
        structureLabels: [] as StructureLabel[],
        structureLines: [] as StructureLine[],
        orderBlocks: [] as Zone[],
        fairValueGaps: [] as Zone[],
        inverseFairValueGaps: [] as Zone[],
        previousDayHigh: null as { y: number; price: number } | null,
        previousDayLow: null as { y: number; price: number } | null,
        previousDayEq: null as { y: number; price: number } | null,
        swingPointLevels: [] as SwingPointLevel[],
        swingFailures: [] as StructureArrow[],
        supplyDemand: null as SupplyDemandGeom | null,
        totalChartVolume: 0,
      };
    }

    const visible = candles
      .map((candle) => ({
        ...candle,
        time: toTime(candle.time),
        open: Number(candle.open),
        close: Number(candle.close),
        high: Number(candle.high),
        low: Number(candle.low),
        tickVolume: candle.tickVolume != null ? Number(candle.tickVolume) : null,
        volume: candle.volume != null ? Number(candle.volume) : null,
      }))
      .filter((candle) => candle.time != null)
      .filter((candle) => [candle.close, candle.high, candle.low].every(Number.isFinite));

    const visibleWithTime = visible as Array<IndicatorCandle & { time: number }>;
    const futureExtensionX = computeFutureExtensionX(
      visibleWithTime,
      handle,
      size.w,
      futureProjectionX,
    );

    const closes = visible.map((candle) => candle.close);
    const ma = maType === "ema"
      ? emaSeries(closes, maPeriod)
      : sma(closes, maPeriod);
    const maPoints: Point[] = visible
      .map((candle, index) => {
        if (ma[index] == null || candle.time == null) return null;
        const x = handle.timeToCoordinate(candle.time);
        const y = handle.priceToCoordinate(ma[index]!);
        if (x == null || y == null) return null;
        return { x, y };
      })
      .filter(Boolean) as Point[];

    const mathCandles = visibleWithTime as IndicatorMathCandle[];
    const bollinger = bollingerBands(closes, 20, 2);
    const bollingerUpperPoints: Point[] = [];
    const bollingerMiddlePoints: Point[] = [];
    const bollingerLowerPoints: Point[] = [];
    for (let index = 0; index < visibleWithTime.length; index += 1) {
      const candle = visibleWithTime[index];
      const x = handle.timeToCoordinate(candle.time);
      if (x == null) continue;
      const band = bollinger[index];
      if (band?.upper != null) {
        const y = handle.priceToCoordinate(band.upper);
        if (y != null) bollingerUpperPoints.push({ x, y });
      }
      if (band?.middle != null) {
        const y = handle.priceToCoordinate(band.middle);
        if (y != null) bollingerMiddlePoints.push({ x, y });
      }
      if (band?.lower != null) {
        const y = handle.priceToCoordinate(band.lower);
        if (y != null) bollingerLowerPoints.push({ x, y });
      }
    }

    const vwapValues = sessionVwap(mathCandles);
    const vwapPoints: Point[] = [];
    for (let index = 0; index < visibleWithTime.length; index += 1) {
      const value = vwapValues[index];
      if (value == null) continue;
      const x = handle.timeToCoordinate(visibleWithTime[index].time);
      const y = handle.priceToCoordinate(value);
      if (x != null && y != null) vwapPoints.push({ x, y });
    }
    const latestVwap = vwapValues.filter((value): value is number => value != null).at(-1) ?? null;
    const latestVwapY = latestVwap != null ? handle.priceToCoordinate(latestVwap) : null;
    const pocRaw = pointOfControl(mathCandles, 100, 50);
    const pocY = pocRaw ? handle.priceToCoordinate(pocRaw.price) : null;
    const poc: PointOfControlGeom =
      pocRaw && pocY != null ? { y: pocY, price: pocRaw.price, volume: pocRaw.volume } : null;

    const structureOverlay = buildStructureOverlay(visible, handle, futureExtensionX, pal);
    // ATR(200) drives the LuxAlgo iFVG gap-size filter (default 0.25
     // × ATR). Filters out micro-gaps that would otherwise clutter the
     // chart with noise on calmer pairs.
    const atrForIfvg = atrSeries(visibleWithTime as IndicatorMathCandle[], 200);
    const inverseFairValueGaps = buildInverseFvgs(
      visibleWithTime,
      handle,
      futureExtensionX,
      atrForIfvg,
      pal,
    );
    const { high: previousDayHigh, low: previousDayLow, eq: previousDayEq } =
      buildPreviousDayLevels(visibleWithTime, handle);
    const swingPointLevels = buildSwingPointLevels(visibleWithTime, handle, futureExtensionX);
    const supplyDemand = buildSupplyDemandBands(visibleWithTime, handle);
    // Total tickVolume across the visible window — used as the
    // denominator for OB volume-percent labels ("1.082K (13%)").
    // Considers the last 200 bars to keep the % responsive on long
    // history charts. Falls back to plain `volume` when tickVolume
    // isn't reported.
    const totalChartVolume = visibleWithTime
      .slice(-200)
      .reduce((sum, c) => sum + (Number(c.tickVolume ?? c.volume ?? 0) || 0), 0);

    const latestMaY = maPoints.length > 0 ? maPoints[maPoints.length - 1].y : null;

    return {
      maPath: toPath(maPoints),
      latestMaY,
      bollingerUpperPath: toPath(bollingerUpperPoints),
      bollingerMiddlePath: toPath(bollingerMiddlePoints),
      bollingerLowerPath: toPath(bollingerLowerPoints),
      bollingerFillPath: toAreaPath(bollingerUpperPoints, bollingerLowerPoints),
      vwapPath: toPath(vwapPoints),
      latestVwap,
      latestVwapY,
      poc,
      structureLabels: structureOverlay.labels,
      structureLines: structureOverlay.lines,
      // Filter to the latest `orderBlockCount` per direction (default 1
      // bullish + 1 bearish). The picker on the toolbar lets the user
      // bump this to 2 or 3 each side when wider context is wanted.
      // After filtering, applyProjectionFilter downgrades the `extend`
      // flag on any zone past the projectionCount window — so a user
      // can show 3 OBs but only project the latest 1.
      orderBlocks: applyProjectionFilter(
        pickLatestZonesPerDirection(structureOverlay.orderBlocks, orderBlockCount),
        projectionCount,
      ),
      // Same per-direction picker for FVGs (latest N bullish + N bearish).
      fairValueGaps: applyProjectionFilter(
        pickLatestZonesPerDirection(structureOverlay.fairValueGaps, fvgCount),
        projectionCount,
      ),
      // Same per-direction picker for iFVGs: latest N up + N down.
      // Default 1 each side keeps the chart calm.
      inverseFairValueGaps: applyProjectionFilter(
        pickLatestZonesPerDirection(inverseFairValueGaps, inverseFvgCount),
        projectionCount,
      ),
      previousDayHigh,
      previousDayLow,
      previousDayEq,
      swingPointLevels,
      swingFailures: structureOverlay.swingFailures,
      supplyDemand,
      totalChartVolume,
    };
  }, [candles, canvasRef, size.h, size.w, version, futureProjectionX, orderBlockCount, inverseFvgCount, fvgCount, projectionCount, maPeriod, maType, pal]);

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-[22]" aria-hidden>
      <svg
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
        className="absolute inset-0"
        style={{
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
        {active.orderBlocks
          ? geometry.orderBlocks.map((zone, index) => (
              <ZoneBox key={`ob-${index}`} zone={zone} variant="ob" pal={pal} />
            ))
          : null}

        {active.fvg
          ? geometry.fairValueGaps.map((zone, index) => (
              <ZoneBox key={`fvg-${index}`} zone={zone} variant="fvg" pal={pal} />
            ))
          : null}

        {active.ifvg
          ? geometry.inverseFairValueGaps.map((zone, index) => (
              <ZoneBox key={`ifvg-${index}`} zone={zone} variant="ifvg" pal={pal} />
            ))
          : null}

        {/* Supply / Demand bands — top 25% of the latest swing range
            is Supply (faint red), bottom 25% is Demand (faint emerald),
            mid is the EQ line. All three labels sit on the LEFT rail
            so they don't collide with fib % / price on the right.
            Renders BEFORE PDH/PDL/PDQ in the JSX, which means it sits
            under those lines in z-order — exactly per spec, since SD
            is contextual background and PDH/PDL/PDQ are tactical. */}
        {active.supplyDemand && geometry.supplyDemand ? (
          <SupplyDemandOverlay sd={geometry.supplyDemand} width={size.w} pal={pal} />
        ) : null}

        {/* Previous Day High / Low / Equilibrium — thin SOLID lines
            spanning the left rail to the right rail, with their LABELS
            pinned to the LEFT rail (`LEFT_RAIL_OFFSET`). Keeping these
            labels on the left frees the right rail for fib %, fib
            price, OB volume and the Supply / Demand band tags above
            so the two columns never collide on small phone screens. */}
        {active.pdh && geometry.previousDayHigh ? (
          <g>
            <line
              x1={LEFT_RAIL_OFFSET}
              x2={size.w - RIGHT_RAIL_OFFSET}
              y1={geometry.previousDayHigh.y}
              y2={geometry.previousDayHigh.y}
              stroke={pal.pdhStroke}
              strokeWidth={1}
            />
            <text
              x={LEFT_RAIL_OFFSET}
              y={geometry.previousDayHigh.y - 4}
              textAnchor="start"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontSize="9.5"
              fontWeight="700"
              fill={pal.pdhLabel}
              stroke={pal.textStroke11}
              strokeWidth="2.6"
              paintOrder="stroke"
            >
              PDH
            </text>
          </g>
        ) : null}

        {active.pdl && geometry.previousDayLow ? (
          <g>
            <line
              x1={LEFT_RAIL_OFFSET}
              x2={size.w - RIGHT_RAIL_OFFSET}
              y1={geometry.previousDayLow.y}
              y2={geometry.previousDayLow.y}
              stroke={pal.pdlStroke}
              strokeWidth={1}
            />
            <text
              x={LEFT_RAIL_OFFSET}
              y={geometry.previousDayLow.y + 12}
              textAnchor="start"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontSize="9.5"
              fontWeight="700"
              fill={pal.pdlLabel}
              stroke={pal.textStroke11}
              strokeWidth="2.6"
              paintOrder="stroke"
            >
              PDL
            </text>
          </g>
        ) : null}

        {active.pdq && geometry.previousDayEq ? (
          <g>
            <line
              x1={LEFT_RAIL_OFFSET}
              x2={size.w - RIGHT_RAIL_OFFSET}
              y1={geometry.previousDayEq.y}
              y2={geometry.previousDayEq.y}
              stroke={pal.pdqStroke}
              strokeWidth={1}
            />
            <text
              x={LEFT_RAIL_OFFSET}
              y={geometry.previousDayEq.y - 4}
              textAnchor="start"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontSize="9.5"
              fontWeight="700"
              fill={pal.pdqLabel}
              stroke={pal.textStroke11}
              strokeWidth="2.6"
              paintOrder="stroke"
            >
              PDQ
            </text>
          </g>
        ) : null}

        {active.swingPoints
          ? geometry.swingPointLevels.map((level, index) => {
              const isHigh = level.kind === "high";
              const stroke = isHigh ? pal.swingHighStroke : pal.swingLowStroke;
              const fill = isHigh ? pal.swingHighFill : pal.swingLowFill;
              // When MARKET STRUCTURE is also on, the HH / HL / LH / LL
              // labels sit at ~y-6 above their pivot lines. We push the
              // swing SH / SL labels further out (-18 / +24 instead of
              // -7 / +13) so the two layers stack cleanly, never overlap.
              const yOffset = active.structure
                ? isHigh
                  ? -18
                  : 24
                : isHigh
                  ? -7
                  : 13;
              return (
                <g key={`swing-${level.kind}-${index}`}>
                  <line
                    x1={level.x1}
                    x2={level.x2}
                    y1={level.y}
                    y2={level.y}
                    stroke={stroke}
                    strokeWidth={1.15}
                    strokeDasharray="2 5"
                    strokeLinecap="round"
                  />
                  <circle cx={level.x1} cy={level.y} r={2.5} fill={fill} opacity={0.88} />
                  <text
                    x={Math.max(6, level.x1 - 3)}
                    y={level.y + yOffset}
                    textAnchor="end"
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    fontSize="9"
                    fontWeight="700"
                    fill={fill}
                    stroke={pal.textStroke10}
                    strokeWidth="2.2"
                    paintOrder="stroke"
                  >
                    {level.label}
                  </text>
                </g>
              );
            })
          : null}

        {/* The legacy blue-dotted "rolling 50-bar mid-range" line was
            removed: it was a noisy proxy for "current-day equilibrium"
            and the dedicated PDQ indicator now expresses the same idea
            cleanly with a fixed level from yesterday's H + L. */}

        {/* BOS/MSS structure lines — premium LuxAlgo style: thinner
            lines, smaller labels, softer opacity. BOS = dashed
            (continuation), MSS = solid (reversal/break). */}
        {active.structure
          ? geometry.structureLines.map((item, index) => (
              <g key={`line-${item.label}-${index}`}>
                <line
                  x1={item.x1}
                  x2={item.x2}
                  y1={item.y}
                  y2={item.y}
                  stroke={item.bullish ? pal.structBullLine : pal.structBearLine}
                  strokeWidth={item.continuation ? 0.8 : 1.2}
                  strokeDasharray={item.continuation ? "5 4" : undefined}
                />
                <text
                  x={(item.x1 + item.x2) / 2}
                  y={item.y - 5}
                  textAnchor="middle"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fontSize="8"
                  fontWeight="500"
                  fill={item.bullish ? pal.structBullText : pal.structBearText}
                  stroke={pal.textStroke06}
                  strokeWidth="2"
                  paintOrder="stroke"
                >
                  {item.label}
                </text>
              </g>
            ))
          : null}

        {active.ma && geometry.maPath ? (
          <g pointerEvents="none">
            <path d={geometry.maPath} fill="none" stroke={pal.maLine} strokeWidth={1.7} />
            {geometry.latestMaY != null ? (
              <text
                x={size.w - RIGHT_RAIL_OFFSET}
                y={Math.max(12, Math.min(size.h - 4, geometry.latestMaY - 4))}
                textAnchor="end"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontSize="9"
                fontWeight={700}
                fill={pal.maLabel}
                stroke={pal.textStroke09}
                strokeWidth={2.4}
                paintOrder="stroke"
              >
                {maType === "ema" ? "EMA" : "MA"}{maPeriod}
              </text>
            ) : null}
          </g>
        ) : null}

        {active.bollinger && geometry.bollingerFillPath ? (
          <path d={geometry.bollingerFillPath} fill={pal.bolFill} stroke="none" />
        ) : null}
        {active.bollinger && geometry.bollingerUpperPath ? (
          <path d={geometry.bollingerUpperPath} fill="none" stroke={pal.bolBand} strokeWidth={1} />
        ) : null}
        {active.bollinger && geometry.bollingerMiddlePath ? (
          <path d={geometry.bollingerMiddlePath} fill="none" stroke={pal.bolMid} strokeWidth={0.85} strokeDasharray="4 4" />
        ) : null}
        {active.bollinger && geometry.bollingerLowerPath ? (
          <path d={geometry.bollingerLowerPath} fill="none" stroke={pal.bolBand} strokeWidth={1} />
        ) : null}

        {active.vwap && geometry.vwapPath ? (
          <g pointerEvents="none">
            <path d={geometry.vwapPath} fill="none" stroke={pal.vwapLine} strokeWidth={1.35} />
            {geometry.latestVwap != null ? (
              <text
                x={size.w - RIGHT_RAIL_OFFSET}
                y={Math.max(12, Math.min(size.h - 4, (geometry.latestVwapY ?? 14) - 4))}
                textAnchor="end"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontSize="9"
                fontWeight={700}
                fill={pal.vwapLabel}
                stroke={pal.textStroke09}
                strokeWidth={2.4}
                paintOrder="stroke"
              >
                VWAP {geometry.latestVwap.toFixed(2)}
              </text>
            ) : null}
          </g>
        ) : null}

        {active.poc && geometry.poc ? (
          <g pointerEvents="none">
            <line
              x1={LEFT_RAIL_OFFSET}
              x2={size.w - RIGHT_RAIL_OFFSET}
              y1={geometry.poc.y}
              y2={geometry.poc.y}
              stroke={pal.pocStroke}
              strokeWidth={1}
              strokeDasharray="6 4"
            />
            <text
              x={size.w - RIGHT_RAIL_OFFSET}
              y={geometry.poc.y - 4}
              textAnchor="end"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontSize="9"
              fontWeight={700}
              fill={pal.pocLabel}
              stroke={pal.textStroke09}
              strokeWidth={2.4}
              paintOrder="stroke"
            >
              POC {geometry.poc.price.toFixed(2)}
            </text>
          </g>
        ) : null}

        {/* Structure pivot labels (HH/HL/LH/LL) — subtle, premium style.
            Smaller font, thinner weight, softer opacity so they inform
            without screaming over the candles. */}
        {active.structure
          ? geometry.structureLabels.map((item, index) => (
              <g key={`${item.label}-${index}`}>
                <text
                  x={item.x}
                  y={item.y}
                  textAnchor="middle"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fontSize="8"
                  fontWeight="500"
                  fill={item.kind === "high" ? pal.pivotHigh : pal.pivotLow}
                  stroke={pal.textStroke07}
                  strokeWidth="2"
                  paintOrder="stroke"
                >
                  {item.label}
                </text>
              </g>
            ))
          : null}

        {active.structure
          ? geometry.swingFailures.map((item, index) => (
              <g key={`sfp-${index}`}>
                <text
                  x={item.x}
                  y={item.y}
                  textAnchor="middle"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fontSize="8"
                  fontWeight="500"
                  fill={item.bullish ? pal.sfpBull : pal.sfpBear}
                  stroke={pal.textStroke06}
                  strokeWidth="2"
                  paintOrder="stroke"
                >
                  {item.label}
                </text>
              </g>
            ))
          : null}

      </svg>
    </div>
  );
}

/**
 * Format a raw tick-volume number into a compact human label.
 * 1234   → "1.23K"
 * 11_234 → "11.2K"
 * 1.2M   → "1.20M"
 */
/**
 * Extracted Supply / Demand overlay so TypeScript can narrow nullable
 * fields cleanly — JSX ternaries on struct fields don't narrow through
 * boolean variables.
 */
function SupplyDemandOverlay({ sd, width, pal }: { sd: SupplyDemandGeom; width: number; pal: OverlayPalette }) {
  const bandW = Math.max(0, width - RIGHT_RAIL_OFFSET - LEFT_RAIL_OFFSET);
  return (
    <g pointerEvents="none">
      {sd.supplyTop && sd.supplyBottom ? (
        <>
          <rect
            x={LEFT_RAIL_OFFSET}
            y={sd.supplyTop.y}
            width={bandW}
            height={Math.max(1, sd.supplyBottom.y - sd.supplyTop.y)}
            fill={pal.supplyFill}
            stroke={pal.supplyStroke}
            strokeWidth={0.6}
            strokeDasharray="3 3"
          />
          <text
            x={LEFT_RAIL_OFFSET}
            y={(sd.supplyTop.y + sd.supplyBottom.y) / 2 + 3}
            textAnchor="start"
            fontFamily="ui-sans-serif, system-ui, -apple-system"
            fontSize="9"
            fontWeight={700}
            letterSpacing="0.5"
            fill={pal.supplyLabel}
            stroke={pal.textStroke07}
            strokeWidth={2}
            paintOrder="stroke"
          >
            SUPPLY
          </text>
        </>
      ) : null}
      {sd.demandTop && sd.demandBottom ? (
        <>
          <rect
            x={LEFT_RAIL_OFFSET}
            y={sd.demandTop.y}
            width={bandW}
            height={Math.max(1, sd.demandBottom.y - sd.demandTop.y)}
            fill={pal.demandFill}
            stroke={pal.demandStroke}
            strokeWidth={0.6}
            strokeDasharray="3 3"
          />
          <text
            x={LEFT_RAIL_OFFSET}
            y={(sd.demandTop.y + sd.demandBottom.y) / 2 + 3}
            textAnchor="start"
            fontFamily="ui-sans-serif, system-ui, -apple-system"
            fontSize="9"
            fontWeight={700}
            letterSpacing="0.5"
            fill={pal.demandLabel}
            stroke={pal.textStroke07}
            strokeWidth={2}
            paintOrder="stroke"
          >
            DEMAND
          </text>
        </>
      ) : null}
      {sd.eq ? (
        <>
          <line
            x1={LEFT_RAIL_OFFSET}
            x2={width - RIGHT_RAIL_OFFSET}
            y1={sd.eq.y}
            y2={sd.eq.y}
            stroke={pal.eqStroke}
            strokeWidth={0.85}
            strokeDasharray="2 5"
          />
          <text
            x={LEFT_RAIL_OFFSET}
            y={sd.eq.y - 3}
            textAnchor="start"
            fontFamily="ui-sans-serif, system-ui, -apple-system"
            fontSize="8.5"
            fontWeight={600}
            letterSpacing="0.4"
            fill={pal.eqLabel}
            stroke={pal.textStroke07}
            strokeWidth={2}
            paintOrder="stroke"
          >
            EQ
          </text>
        </>
      ) : null}
    </g>
  );
}

function formatVolume(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}K`;
  return `${Math.round(n)}`;
}

/**
 * LuxAlgo-style volumetric label rendered on the SHARED right rail of
 * the chart. Shows total OB volume, % of recent chart volume and the
 * buyer/seller dominance — exactly the layout in the user's reference
 * photo ("1.082K (13%)") with a dashed line drawn from the OB out to
 * the label so the trader can trace which OB it belongs to.
 *
 * Values are 100% honest — they come straight from the candle tickVolume
 * inside the OB band (see buildVolumetricBreakdown).
 */
/**
 * OB volume label rendered INSIDE the order block, anchored to its
 * right edge (just before the projection X). Replaces the older
 * `VolumetricRightRailLabel` which drew a dashed connector out to the
 * price rail — the user explicitly asked for the label to live inside
 * the box instead of on the rail.
 *
 * Two short text rows:
 *   • Top:    "153.588K (32%)"  → absolute tickVolume + share of recent
 *              chart volume.
 *   • Bottom: "B 54%" / "S 67%" → dominant side + its percentage.
 *
 * Falls back to a single row when the OB is too thin to fit both.
 */
function ObInnerVolumeLabel({ zone, obRightX, pal }: { zone: Zone; obRightX: number; pal: OverlayPalette }) {
  const v = zone.volumetric;
  if (!v || v.totalVolume <= 0) return null;
  if (zone.height < 8) return null;

  const volLabel = formatVolume(v.totalVolume);
  const buyersWin = v.buyerPercent >= v.sellerPercent;
  const sideLabel = buyersWin
    ? `B ${Math.round(v.buyerPercent)}%`
    : `S ${Math.round(v.sellerPercent)}%`;
  // Both rows use the OB's own direction colour — softer, premium look.
  // No more red/green dominance split: the volumetric inner bars already
  // show which side is bigger. Dialled back to 75% opacity so the labels
  // read as ambient data, not loud annotations.
  const labelColor = zone.direction === "up" ? pal.obVolLabelUp : pal.obVolLabelDown;
  const sideColor = labelColor;
  const baseColor = labelColor;

  // Right edge inside the box, with 6px right-padding so text doesn't
  // sit flush against the border.
  const xRight = obRightX - 6;
  const canFitTwoRows = zone.height >= 22;
  const yTop = canFitTwoRows ? zone.midY - 2 : zone.midY + 3;
  const yBottom = zone.midY + 11;

  return (
    <g pointerEvents="none">
      <text
        x={xRight}
        y={yTop}
        textAnchor="end"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize="8.5"
        fontWeight={600}
        fill={baseColor}
        stroke={pal.textStroke08}
        strokeWidth="2.2"
        paintOrder="stroke"
      >
        {volLabel}
      </text>
      {canFitTwoRows ? (
        <text
          x={xRight}
          y={yBottom}
          textAnchor="end"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize="8"
          fontWeight={600}
          fill={sideColor}
          stroke={pal.textStroke08}
          strokeWidth="2.2"
          paintOrder="stroke"
        >
          {sideLabel}
        </text>
      ) : null}
    </g>
  );
}

/**
 * Single-zone renderer used by OB / FVG / iFVG.
 *
 * - OB: fully filled translucent zone reaching a uniform right edge
 *   (every visible OB stops at the same X). Inside, two horizontal
 *   sub-bars whose WIDTHS are proportional to seller vs buyer
 *   tickVolume share — bigger side is visibly longer. Dotted midline
 *   inside the box. Small "OB" label top-left, volume + dominance
 *   labels INSIDE the right edge (no right-rail connector).
 * - FVG: dense solid filled rect only — no extension, no dashed line.
 * - iFVG: two-tone box (original colour | inverted colour) split at
 *   the inversion candle, dashed midline, ▲/▼ trigger marker.
 */
function ZoneBox({ zone, variant, pal }: { zone: Zone; variant: "ob" | "fvg" | "ifvg"; pal: OverlayPalette }) {

  const fadeFactor = zone.mitigated ? 0.45 : 1;
  const detectionWidth = Math.max(0, zone.detectionEndX - zone.x);
  const detectionEndX = zone.x + detectionWidth;

  // OB → LuxAlgo Volumetric layout, refined per user feedback:
  //   • One fully filled translucent box from origin to a UNIFORM right
  //     edge (futureExtensionX). Every visible OB reaches the same X so
  //     a 1/2/3 count filter only controls how many are shown, never
  //     their length.
  //   • Inside the source-candle column (zone.x → detectionEndX) sit
  //     two stacked horizontal mini-bars. Each occupies half of the box
  //     height. Their WIDTH (= length) is proportional to its side's
  //     tickVolume share — the bigger side is visibly longer, never
  //     equal by default.
  //       - Top half:    red seller bar,  width = sellerPct × innerMax
  //       - Bottom half: teal buyer bar,  width = buyerPct  × innerMax
  //   • A dotted midline runs through the box but STOPS at the right
  //     edge (no overflow into the price axis).
  //   • Two small labels:
  //       - "OB" at top-left corner.
  //       - "vol (pct%) / B|S xx%" stacked at the RIGHT edge of the box,
  //         inside the OB itself. The old right-rail connector + label
  //         are gone.
  if (variant === "ob") {
    const obWidth = Math.max(2, zone.extendX - zone.x);
    const obRightX = zone.x + obWidth;
    const v = zone.volumetric;
    // Inner sub-bars sit inside the SOURCE candle column. They share the
    // same base width so percentages are visually comparable.
    const innerMaxW = Math.max(8, detectionWidth);
    const sellerW = v && v.totalVolume > 0 ? innerMaxW * (v.sellerPercent / 100) : 0;
    const buyerW = v && v.totalVolume > 0 ? innerMaxW * (v.buyerPercent / 100) : 0;
    const halfH = zone.height / 2;
    const sellerFill = pal.sellerBar;
    const buyerFill = pal.buyerBar;
    // LuxAlgo-style: single clean box — ONE fill colour, ONE border.
    // No two-tone source/extension split. Simple and premium.
    const boxFill = zone.direction === "up" ? pal.obUpExt : pal.obDownExt;
    return (
      <g opacity={fadeFactor}>
        <rect
          x={zone.x}
          y={zone.y}
          width={obWidth}
          height={zone.height}
          fill={boxFill}
          stroke={zone.stroke}
          strokeWidth={1}
          rx={2}
        />
        {v && v.totalVolume > 0 && sellerW > 0 && halfH > 1 ? (
          <rect
            x={zone.x}
            y={zone.y}
            width={Math.max(1, sellerW)}
            height={halfH}
            fill={sellerFill}
            rx={1}
          />
        ) : null}
        {v && v.totalVolume > 0 && buyerW > 0 && halfH > 1 ? (
          <rect
            x={zone.x}
            y={zone.y + halfH}
            width={Math.max(1, buyerW)}
            height={halfH}
            fill={buyerFill}
            rx={1}
          />
        ) : null}
        {/* Dashed midline across the full zone */}
        <line
          x1={zone.x}
          x2={obRightX}
          y1={zone.midY}
          y2={zone.midY}
          stroke={zone.stroke}
          strokeWidth={1.2}
          strokeDasharray="4 3"
          opacity={0.90}
        />

        <ObInnerVolumeLabel zone={zone} obRightX={obRightX} pal={pal} />
      </g>
    );
  }

  // iFVG → LuxAlgo "Inversion Fair Value Gaps" reference visual.
  //   • Two horizontally-stacked filled boxes split at `inversionX`:
  //       - Left  (x → inversionX): ORIGINAL FVG colour (the colour the
  //         box had before the candle that flipped it).
  //       - Right (inversionX → extendX): INVERTED colour (the colour
  //         after the flip). Same colour extends through the forward
  //         projection so the trader still sees the zone reaching into
  //         the future where it matters.
  //   • One dashed gray midline runs across both halves and the
  //     projection.
  //   • Box border is invisible — the colour split is the signal.
  if (variant === "ifvg") {
    const inversionX = Math.max(zone.x, Math.min(zone.inversionX ?? detectionEndX, zone.extendX));
    const rightEndX = zone.extend ? zone.extendX : Math.max(inversionX, detectionEndX);
    // The original colour is the OPPOSITE of zone.fill (which encodes the
    // current/inverted polarity). We derive it from `originalDirection`
    // rather than zone.fill so the colour pair stays consistent even if
    // the fill is tweaked later.
    const originalIsBull = zone.originalDirection === "up";
    const originalFill = originalIsBull ? pal.ifvgBullOrig : pal.ifvgBearOrig;
    const leftWidth = Math.max(0, inversionX - zone.x);
    const rightWidth = Math.max(0, rightEndX - inversionX);
    return (
      <g opacity={fadeFactor}>
        {leftWidth > 0 ? (
          <rect
            x={zone.x}
            y={zone.y}
            width={leftWidth}
            height={zone.height}
            fill={originalFill}
            rx={2}
          />
        ) : null}
        {rightWidth > 0 ? (
          <rect
            x={inversionX}
            y={zone.y}
            width={rightWidth}
            height={zone.height}
            fill={zone.fill}
            rx={2}
          />
        ) : null}
        <line
          x1={zone.x}
          x2={rightEndX}
          y1={zone.midY}
          y2={zone.midY}
          stroke={pal.ifvgMidline}
          strokeWidth={0.7}
          strokeDasharray="3 4"
        />


      </g>
    );
  }

  // FVG → only the dense filled block in its own colour. No forward
  // bleed, no dashed midline, nothing extending past the box. Bullish
  // FVG is light blue, bearish is amber — visually distinct from iFVG
  // (teal/red) and OB (teal/red). Label colour matches the zone fill
  // so text sits calmly inside the box.

  return (
    <g opacity={fadeFactor}>
      <rect
        x={zone.x}
        y={zone.y}
        width={Math.max(2, detectionWidth)}
        height={zone.height}
        fill={zone.fill}
        stroke={zone.stroke}
        strokeWidth={1}
        rx={2}
      />

    </g>
  );
}

function toTime(raw: string): number | null {
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

function toPath(points: Point[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function toAreaPath(upper: Point[], lower: Point[]): string {
  if (upper.length < 2 || lower.length < 2) return "";
  const top = toPath(upper);
  const bottom = lower
    .slice()
    .reverse()
    .map((point) => `L${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  return `${top} ${bottom} Z`;
}

function sma(values: number[], period: number): Array<number | null> {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    const slice = values.slice(index + 1 - period, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / period;
  });
}

/**
 * Compute the X position the iFVG / OB extensions should reach. Defaults
 * to "5 bars past the last candle" using the average pixel-per-bar spacing
 * inferred from the last few candles. When a user-controlled
 * future-projection cursor exists we let it win as long as it's further
 * right than the default.
 */
function computeFutureExtensionX(
  candles: Array<IndicatorCandle & { time: number }>,
  handle: ChartCanvasHandle,
  chartWidth: number,
  futureProjectionX: number | null,
): number {
  if (candles.length === 0) return chartWidth - 4;
  const lastTime = candles[candles.length - 1].time;
  const lastX = handle.timeToCoordinate(lastTime);
  if (lastX == null) return chartWidth - 4;

  // Estimate bar pixel width from the last few candles. Robust against
  // weekend gaps because we use the median of the sampled deltas.
  const sample: number[] = [];
  for (let i = Math.max(1, candles.length - 12); i < candles.length; i += 1) {
    const here = handle.timeToCoordinate(candles[i].time);
    const before = handle.timeToCoordinate(candles[i - 1].time);
    if (here != null && before != null) {
      const delta = here - before;
      if (Number.isFinite(delta) && delta > 0) sample.push(delta);
    }
  }
  const median = sample.length === 0 ? 8 : sample.sort((a, b) => a - b)[Math.floor(sample.length / 2)];
  const minTarget = lastX + median * MIN_FUTURE_BARS;
  // Cap at the right edge of the chart so we never overflow into the price
  // axis gutter.
  const cap = Math.max(0, chartWidth - 4);
  if (futureProjectionX != null && futureProjectionX > minTarget && futureProjectionX <= cap) {
    return futureProjectionX;
  }
  return Math.min(cap, Math.max(minTarget, lastX + median));
}

function structurePivots(candles: IndicatorCandle[]) {
  const visible = candles.filter((candle): candle is IndicatorCandle & { time: number } => candle.time != null).slice(-220);
  const strength = visible.length >= 120 ? 4 : 3;
  const minBarsBetweenSwings = strength * 2 + 2;
  const volatility = atr(visible, 14) ?? averageRange(visible);
  const minSwingMove = Math.max(volatility * 1.35, averageRange(visible) * 0.9);
  const candidates: StructurePivot[] = [];

  if (visible.length < strength * 2 + 8 || minSwingMove <= 0) return [];

  for (let index = strength; index < visible.length - strength; index += 1) {
    const candle = visible[index];
    const left = visible.slice(index - strength, index);
    const right = visible.slice(index + 1, index + strength + 1);
    const leftHigh = Math.max(...left.map((other) => other.high));
    const rightHigh = Math.max(...right.map((other) => other.high));
    const leftLow = Math.min(...left.map((other) => other.low));
    const rightLow = Math.min(...right.map((other) => other.low));

    if (candle.high > leftHigh && candle.high >= rightHigh) {
      candidates.push({ index, time: candle.time, price: candle.high, kind: "high" });
    }
    if (candle.low < leftLow && candle.low <= rightLow) {
      candidates.push({ index, time: candle.time, price: candle.low, kind: "low" });
    }
  }

  const swings = compactStructurePivots(candidates, minBarsBetweenSwings, minSwingMove);
  const pivots: Array<{ time: number; price: number; kind: "high" | "low"; label: string }> = [];
  let lastHigh: number | null = null;
  let lastLow: number | null = null;

  for (const swing of swings) {
    if (swing.kind === "high") {
      const label = lastHigh == null || swing.price > lastHigh ? "HH" : "LH";
      lastHigh = swing.price;
      pivots.push({ time: swing.time, price: swing.price, kind: "high", label });
    } else {
      const label = lastLow == null || swing.price > lastLow ? "HL" : "LL";
      lastLow = swing.price;
      pivots.push({ time: swing.time, price: swing.price, kind: "low", label });
    }
  }

  return pivots.slice(-10);
}

function buildStructureOverlay(
  candles: IndicatorCandle[],
  handle: ChartCanvasHandle,
  futureExtensionX: number,
  pal: OverlayPalette,
): {
  labels: StructureLabel[];
  lines: StructureLine[];
  orderBlocks: Zone[];
  fairValueGaps: Zone[];
  swingFailures: StructureArrow[];
} {
  const visible = candles.filter((candle): candle is IndicatorCandle & { time: number } => candle.time != null).slice(-220);
  if (visible.length < 12) {
    return {
      labels: [],
      lines: [],
      orderBlocks: [],
      fairValueGaps: [],
      swingFailures: [],
    };
  }

  const labels = structurePivots(visible)
    .map((pivot) => {
      const x = handle.timeToCoordinate(pivot.time);
      const y = handle.priceToCoordinate(pivot.price);
      if (x == null || y == null) return null;
      return {
        x,
        y: y + (pivot.kind === "low" ? 16 : -8),
        label: pivot.label,
        kind: pivot.kind,
      };
    })
    .filter(Boolean) as StructureLabel[];

  const strength = visible.length >= 120 ? 5 : 4;
  const pivotHighs = Array<number | null>(visible.length).fill(null);
  const pivotLows = Array<number | null>(visible.length).fill(null);
  for (let index = strength; index < visible.length - strength; index += 1) {
    const candle = visible[index];
    const left = visible.slice(index - strength, index);
    const right = visible.slice(index + 1, index + strength + 1);
    if (left.every((other) => candle.high > other.high) && right.every((other) => candle.high >= other.high)) {
      pivotHighs[index] = candle.high;
    }
    if (left.every((other) => candle.low < other.low) && right.every((other) => candle.low <= other.low)) {
      pivotLows[index] = candle.low;
    }
  }

  const lines: StructureLine[] = [];
  const swingFailures: StructureArrow[] = [];
  const orderBlocks: Zone[] = [];
  const fairValueGaps: Zone[] = [];
  let lastHi: number | null = null;
  let lastHiIdx: number | null = null;
  let lastLo: number | null = null;
  let lastLoIdx: number | null = null;
  let isBull = true;
  const displacementThreshold = atr(visible, 14) ?? averageRange(visible);
  // FVG ATR(200) gap filter — same idea as iFVGs but applied here so
  // micro-gaps (< 0.25 × ATR) never get drawn.
  const atrSeriesForFvg = atrSeries(visible as IndicatorMathCandle[], 200);
  const FVG_GAP_MULT = 0.25;
  // Volume gating for Order Blocks: require the OB candle's tick
  // volume to exceed the SMA-20 of volume, so accidental displacement
  // bars on quiet sessions don't get flagged. Falls back to "no gate"
  // when the broker doesn't ship tick volume.
  const volumeSeries = visible.map((c) => (c.tickVolume != null ? Number(c.tickVolume) : null));
  const hasVolume = volumeSeries.some((v) => v != null && v > 0);
  const volumeSma = hasVolume
    ? smaSeries(volumeSeries.map((v) => v ?? 0), 20)
    : Array<number | null>(visible.length).fill(null);

  for (let index = 0; index < visible.length; index += 1) {
    if (pivotHighs[index] != null) {
      lastHi = pivotHighs[index];
      lastHiIdx = index;
    }
    if (pivotLows[index] != null) {
      lastLo = pivotLows[index];
      lastLoIdx = index;
    }

    const candle = visible[index];
    const previous = index > 0 ? visible[index - 1] : null;

    if (lastHi != null && lastHiIdx != null && candle.close > lastHi) {
      const x1 = handle.timeToCoordinate(visible[lastHiIdx].time);
      const x2 = handle.timeToCoordinate(candle.time);
      const y = handle.priceToCoordinate(lastHi);
      if (x1 != null && x2 != null && y != null) {
        lines.push({
          x1,
          x2,
          y,
          label: isBull ? "BOS" : "MSS",
          bullish: true,
          continuation: isBull,
        });
      }
      isBull = true;
      lastHi = null;
      lastHiIdx = null;
    }

    if (lastLo != null && lastLoIdx != null && candle.close < lastLo) {
      const x1 = handle.timeToCoordinate(visible[lastLoIdx].time);
      const x2 = handle.timeToCoordinate(candle.time);
      const y = handle.priceToCoordinate(lastLo);
      if (x1 != null && x2 != null && y != null) {
        lines.push({
          x1,
          x2,
          y,
          label: isBull ? "MSS" : "BOS",
          bullish: false,
          continuation: !isBull,
        });
      }
      isBull = false;
      lastLo = null;
      lastLoIdx = null;
    }

    if (previous && displacementThreshold > 0 && Math.abs(candle.close - candle.open) > displacementThreshold * 0.9) {
      const top = Math.max(previous.open, previous.close);
      const bottom = Math.min(previous.open, previous.close);
      // OB box sits NEXT TO the 2 candles that made it (the OB source
      // candle + the displacement candle) instead of overlapping them.
      // The trader still sees both real candles cleanly; the zone +
      // its volumetric inner bars start at the candle right after the
      // displacement. Falls back to the displacement candle's X when
      // there is no next candle yet (live tick).
      const sourceStartIdx = Math.min(index + 1, visible.length - 1);
      const x = handle.timeToCoordinate(visible[sourceStartIdx].time);
      const x2 = handle.timeToCoordinate(visible[Math.min(index + 5, visible.length - 1)].time);
      const topY = handle.priceToCoordinate(top);
      const bottomY = handle.priceToCoordinate(bottom);
      if (x != null && x2 != null && topY != null && bottomY != null && Math.abs(bottomY - topY) > 1) {
        const isBullishOb = candle.close > candle.open && previous.close < previous.open;
        const isBearishOb = candle.close < candle.open && previous.close > previous.open;
        // MSB gate: the displacement candle must actually break the
        // most recent opposite-side pivot — that's what turns an OB
        // candle into a "real" institutional footprint instead of a
        // random spike. We check up to 3 bars forward so the break
        // can confirm slightly after the engulfing.
        const lookahead = visible.slice(index, Math.min(index + 4, visible.length));
        const brokeStructureUp =
          lastLo != null && lookahead.some((cc) => cc.close > top + (top - bottom) * 0.25);
        const brokeStructureDown =
          lastHi != null && lookahead.some((cc) => cc.close < bottom - (top - bottom) * 0.25);
        const msbConfirmed =
          (isBullishOb && brokeStructureUp) || (isBearishOb && brokeStructureDown);
        // Volume gate: OB candle's tickVolume must exceed SMA-20 of
        // volume. Skipped when the broker doesn't ship tickVolume.
        const obVolume = candle.tickVolume != null ? Number(candle.tickVolume) : null;
        const volumeBaseline = volumeSma[index];
        const volumeOk = !hasVolume || (obVolume != null && volumeBaseline != null && obVolume > volumeBaseline);
        if ((isBullishOb || isBearishOb) && msbConfirmed && volumeOk) {
          // Walk forward and check whether the OB has been mitigated:
          // bullish OB is mitigated when a later candle closes BELOW its
          // bottom; bearish OB when a later closes ABOVE its top.
          let mitigated = false;
          for (let k = index + 1; k < visible.length; k += 1) {
            if (isBullishOb && visible[k].close < bottom) {
              mitigated = true;
              break;
            }
            if (isBearishOb && visible[k].close > top) {
              mitigated = true;
              break;
            }
          }

          const detectionEndX = x2;
          const baseWidth = Math.max(6, x2 - x);
          // Volumetric breakdown is built from REAL tickVolume on green
          // vs red candles whose range overlaps the OB band. Volume
          // profile bars on the left edge are kept for shape; the
          // split-bar (`volumetric`) gives the LuxAlgo-style buyer/seller
          // dominance read at a glance.
          // Mitigated OBs are completely hidden — a red OB below a green
          // OB means it was breached and is no longer valid. Previously we
          // rendered at 45% opacity, but Luka confirmed these should not
          // appear at all ("die zijn mitigated, dat moet niet kunnen").
          if (mitigated) continue;

          const profile = buildVolumeProfile(visible, top, bottom, topY, bottomY);
          const volumetric = buildVolumetricBreakdown(visible, top, bottom);

          orderBlocks.push({
            x,
            y: Math.min(topY, bottomY),
            width: baseWidth,
            height: Math.max(2, Math.abs(bottomY - topY)),
            extendX: Math.max(detectionEndX, futureExtensionX),
            detectionEndX,
            midY: (topY + bottomY) / 2,
            stroke: isBullishOb ? pal.obUpStroke : pal.obDownStroke,
            fill: isBullishOb ? pal.obUpSource : pal.obDownSource,
            direction: isBullishOb ? "up" : "down",
            extend: true,
            mitigated: false,
            volumeProfile: profile,
            volumetric,
          });
        }
      }
    }

    if (index >= 2) {
      const twoBack = visible[index - 2];
      const x = handle.timeToCoordinate(twoBack.time);
      const x2 = handle.timeToCoordinate(candle.time);
      const fvgGapThreshold = (atrSeriesForFvg[index] ?? 0) * FVG_GAP_MULT;
      if (x != null && x2 != null) {
        if (candle.low > twoBack.high && Math.abs(candle.low - twoBack.high) > fvgGapThreshold) {
          const topY = handle.priceToCoordinate(candle.low);
          const bottomY = handle.priceToCoordinate(twoBack.high);
          if (topY != null && bottomY != null && Math.abs(bottomY - topY) > 1) {
            // Bullish FVG mitigated when a later candle closes back BELOW
            // its bottom (the gap got filled).
            let mitigated = false;
            for (let k = index + 1; k < visible.length; k += 1) {
              if (visible[k].close < twoBack.high) {
                mitigated = true;
                break;
              }
            }
            const detectionEndX = x2;
            fairValueGaps.push({
              x,
              y: Math.min(topY, bottomY),
              width: Math.max(4, x2 - x),
              height: Math.max(2, Math.abs(bottomY - topY)),
              detectionEndX,
              extendX: mitigated ? detectionEndX : Math.max(detectionEndX, futureExtensionX),
              midY: (topY + bottomY) / 2,
              stroke: pal.fvgUpStroke,
              fill: pal.fvgUpFill,
              direction: "up",
              extend: !mitigated,
              mitigated,
            });
          }
        } else if (candle.high < twoBack.low && Math.abs(twoBack.low - candle.high) > fvgGapThreshold) {
          const topY = handle.priceToCoordinate(twoBack.low);
          const bottomY = handle.priceToCoordinate(candle.high);
          if (topY != null && bottomY != null && Math.abs(bottomY - topY) > 1) {
            let mitigated = false;
            for (let k = index + 1; k < visible.length; k += 1) {
              if (visible[k].close > twoBack.low) {
                mitigated = true;
                break;
              }
            }
            const detectionEndX = x2;
            fairValueGaps.push({
              x,
              y: Math.min(topY, bottomY),
              width: Math.max(4, x2 - x),
              height: Math.max(2, Math.abs(bottomY - topY)),
              detectionEndX,
              extendX: mitigated ? detectionEndX : Math.max(detectionEndX, futureExtensionX),
              midY: (topY + bottomY) / 2,
              stroke: pal.fvgDownStroke,
              fill: pal.fvgDownFill,
              direction: "down",
              extend: !mitigated,
              mitigated,
            });
          }
        }
      }
    }

    if (previous && lastHi != null && candle.high > lastHi && candle.close < lastHi && previous.high <= lastHi) {
      const x = handle.timeToCoordinate(candle.time);
      const y = handle.priceToCoordinate(candle.high);
      if (x != null && y != null) swingFailures.push({ x, y: y - 10, label: "SFP", bullish: false });
    }
    if (previous && lastLo != null && candle.low < lastLo && candle.close > lastLo && previous.low >= lastLo) {
      const x = handle.timeToCoordinate(candle.time);
      const y = handle.priceToCoordinate(candle.low);
      if (x != null && y != null) swingFailures.push({ x, y: y + 18, label: "SFP", bullish: true });
    }
  }

  return {
    labels,
    lines: lines.slice(-8),
    // Keep up to 20 raw OBs so the render-time per-direction filter has
    // enough source data when one side dominates the most recent bars.
    orderBlocks: orderBlocks.slice(-20),
    // Same idea for FVGs: keep up to 16 so the per-direction picker can
    // show the latest 1 / 2 / 3 bullish + bearish without running out.
    fairValueGaps: fairValueGaps.slice(-16),
    swingFailures: swingFailures.slice(-6),
  };
}

/**
 * Downgrade the `extend` flag on zones past the projectionCount window.
 * The intent: user shows 3 OBs but only wants the latest 1 to extend
 * forward. Older zones still render at their detected position with
 * their detection-end as the right edge — they just don't bleed past
 * it. Walks the input newest-first per direction so the most recent
 * blocks always project, never the older ones.
 */
function applyProjectionFilter(zones: Zone[], n: 1 | 2 | 3): Zone[] {
  if (!zones.length) return zones;
  let upRemaining = n;
  let downRemaining = n;
  const reverseProcessed: Zone[] = [];
  for (let index = zones.length - 1; index >= 0; index -= 1) {
    const zone = zones[index];
    let projects = false;
    if (zone.direction === "up" && upRemaining > 0) {
      projects = true;
      upRemaining -= 1;
    } else if (zone.direction === "down" && downRemaining > 0) {
      projects = true;
      downRemaining -= 1;
    }
    reverseProcessed.push({
      ...zone,
      extend: zone.extend && projects,
    });
  }
  return reverseProcessed.reverse();
}

/**
 * Keep only the latest N zones per direction (1, 2 or 3 each side).
 * Walks chronological zone list from newest backwards so the most recent
 * blocks of each polarity survive even when one side dominates. Used
 * for both order blocks and inverse FVGs (same UX semantics).
 */
function pickLatestZonesPerDirection(zones: Zone[], n: 1 | 2 | 3): Zone[] {
  if (!zones.length) return zones;
  let upRemaining = n;
  let downRemaining = n;
  const reverseKept: Zone[] = [];
  for (let index = zones.length - 1; index >= 0; index -= 1) {
    const zone = zones[index];
    if (zone.direction === "up" && upRemaining > 0) {
      reverseKept.push(zone);
      upRemaining -= 1;
    } else if (zone.direction === "down" && downRemaining > 0) {
      reverseKept.push(zone);
      downRemaining -= 1;
    }
    if (upRemaining === 0 && downRemaining === 0) break;
  }
  return reverseKept.reverse();
}

/**
 * Geometry for the Supply / Demand indicator. Uses the ERC (Extended
 * Range Candle) method: look for the most recent candle whose body is
 * ≥ 1.5× the SMA-14 of bodies (the explosive "drop" or "rally" out of
 * a base). The 1–3 base candles immediately BEFORE the ERC define the
 * S/D zone (their combined high → low). Zone is invalidated once
 * price has eaten more than 50% of the zone OR the candidate side is
 * already on the wrong side of price (supply must sit above current
 * close, demand below).
 */
type SupplyDemandGeom = {
  supplyTop: { y: number; price: number } | null;
  supplyBottom: { y: number; price: number } | null;
  demandTop: { y: number; price: number } | null;
  demandBottom: { y: number; price: number } | null;
  eq: { y: number; price: number } | null;
};

function isErcCandle(body: number, avgBody: number): boolean {
  // Relaxed from 1.5× to 1.25× so more zones appear on volatile
  // instruments (XAUUSD, BTC) where nearly every candle is large.
  return avgBody > 0 && body >= 1.25 * avgBody;
}

/** Average body size over the last `period` candles. */
function avgBodySize(candles: Array<IndicatorCandle>, fromIndex: number, period: number): number {
  let sum = 0;
  let count = 0;
  for (let i = Math.max(0, fromIndex - period + 1); i <= fromIndex; i += 1) {
    sum += Math.abs(candles[i].close - candles[i].open);
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Walk backwards from the most recent confirmed candle looking for the
 * latest unmitigated ERC of each polarity:
 *   • Bearish ERC (close < open with explosive body) → SUPPLY zone is
 *     the combined high/low of up-to-3 base candles immediately before
 *     the ERC.
 *   • Bullish ERC (close > open with explosive body) → DEMAND zone is
 *     the same construct.
 * A zone is invalidated if price has already penetrated > 50% of it
 * since the ERC fired, or if the zone is on the wrong side of price.
 */
function findErcZone(
  candles: Array<IndicatorCandle & { time: number }>,
  direction: "supply" | "demand",
): { top: number; bottom: number } | null {
  if (candles.length < 20) return null;
  const latestClose = candles[candles.length - 1].close;
  // Reserve the last 2 candles so the ERC is fully confirmed.
  for (let i = candles.length - 3; i >= 4; i -= 1) {
    const erc = candles[i];
    const body = Math.abs(erc.close - erc.open);
    const avg = avgBodySize(candles, i - 1, 14);
    if (!isErcCandle(body, avg)) continue;
    const isBearishErc = erc.close < erc.open;
    const isBullishErc = erc.close > erc.open;
    if (direction === "supply" && !isBearishErc) continue;
    if (direction === "demand" && !isBullishErc) continue;
    // Collect up to 3 contiguous base candles before the ERC whose
    // bodies are smaller than the average — these are the "base" of
    // accumulation/distribution.
    const baseCandles: typeof candles = [];
    for (let k = i - 1; k >= Math.max(0, i - 3); k -= 1) {
      const bBody = Math.abs(candles[k].close - candles[k].open);
      if (bBody >= 1.5 * avg) break; // base candles are quiet (relaxed from 1.2×)
      baseCandles.unshift(candles[k]);
    }
    if (baseCandles.length === 0) continue;
    const top = Math.max(...baseCandles.map((b) => b.high));
    const bottom = Math.min(...baseCandles.map((b) => b.low));
    const height = top - bottom;
    if (!Number.isFinite(height) || height <= 0) continue;
    // Wrong-side guard.
    if (direction === "supply" && top <= latestClose) continue;
    if (direction === "demand" && bottom >= latestClose) continue;
    // 75% mitigation check: zone is invalidated only when price
    // penetrates 75% through the zone body (not just the midline).
    // The stricter 50% rule invalidated most zones on volatile
    // instruments like BTC — giving the zone more breathing room
    // keeps meaningful S/D visible on the chart.
    const mitigationLine = direction === "supply"
      ? bottom + height * 0.25   // supply: invalidate if price drops to bottom quarter
      : top - height * 0.25;     // demand: invalidate if price rises to top quarter
    let mitigated = false;
    for (let k = i + 1; k < candles.length; k += 1) {
      if (direction === "supply" && candles[k].low < mitigationLine) { mitigated = true; break; }
      if (direction === "demand" && candles[k].high > mitigationLine) { mitigated = true; break; }
    }
    if (mitigated) continue;
    return { top, bottom };
  }
  return null;
}

function buildSupplyDemandBands(
  candles: Array<IndicatorCandle & { time: number }>,
  handle: ChartCanvasHandle,
): SupplyDemandGeom | null {
  if (candles.length < 20) return null;
  const supply = findErcZone(candles, "supply");
  const demand = findErcZone(candles, "demand");
  // Render whichever zone(s) exist — don't require both. EQ line only
  // shows when both are present (it's the midpoint between them).
  if (!supply && !demand) return null;

  // Project each zone that exists; null-safe wrappers.
  const supplyTopY = supply ? handle.priceToCoordinate(supply.top) : null;
  const supplyBottomY = supply ? handle.priceToCoordinate(supply.bottom) : null;
  const demandTopY = demand ? handle.priceToCoordinate(demand.top) : null;
  const demandBottomY = demand ? handle.priceToCoordinate(demand.bottom) : null;

  const eqPrice =
    supply && demand ? (supply.bottom + demand.top) / 2 : null;
  const eqY = eqPrice != null ? handle.priceToCoordinate(eqPrice) : null;

  return {
    supplyTop:
      supply && supplyTopY != null
        ? { y: supplyTopY, price: supply.top }
        : null,
    supplyBottom:
      supply && supplyBottomY != null
        ? { y: supplyBottomY, price: supply.bottom }
        : null,
    demandTop:
      demand && demandTopY != null
        ? { y: demandTopY, price: demand.top }
        : null,
    demandBottom:
      demand && demandBottomY != null
        ? { y: demandBottomY, price: demand.bottom }
        : null,
    eq:
      eqPrice != null && eqY != null
        ? { y: eqY, price: eqPrice }
        : null,
  };
}

function buildSwingPointLevels(
  candles: Array<IndicatorCandle & { time: number }>,
  handle: ChartCanvasHandle,
  futureExtensionX: number,
): SwingPointLevel[] {
  const strength = 5;
  if (candles.length < strength * 2 + 4) return [];

  const pivots: StructurePivot[] = [];
  for (let index = strength; index < candles.length - strength; index += 1) {
    const candle = candles[index];
    const neighbors = [
      ...candles.slice(index - strength, index),
      ...candles.slice(index + 1, index + strength + 1),
    ];
    if (neighbors.every((other) => candle.high > other.high)) {
      pivots.push({ index, time: candle.time, price: candle.high, kind: "high" });
    }
    if (neighbors.every((other) => candle.low < other.low)) {
      pivots.push({ index, time: candle.time, price: candle.low, kind: "low" });
    }
  }

  const compacted = compactStructurePivots(pivots, 4, averageRange(candles) * 0.65);
  return compacted
    .slice(-4)
    .map((pivot) => {
      const x = handle.timeToCoordinate(pivot.time);
      const y = handle.priceToCoordinate(pivot.price);
      if (x == null || y == null) return null;
      return {
        x1: x,
        x2: Math.max(x + 10, futureExtensionX),
        y,
        kind: pivot.kind,
        label: pivot.kind === "high" ? "SH" : "SL",
      };
    })
    .filter(Boolean) as SwingPointLevel[];
}

function compactStructurePivots(pivots: StructurePivot[], minBars: number, minMove: number): StructurePivot[] {
  const out: StructurePivot[] = [];

  for (const pivot of pivots) {
    const last = out.at(-1);
    if (!last) {
      out.push(pivot);
      continue;
    }

    if (pivot.kind === last.kind) {
      const moreExtreme = pivot.kind === "high" ? pivot.price > last.price : pivot.price < last.price;
      if (moreExtreme) out[out.length - 1] = pivot;
      continue;
    }

    const enoughBars = pivot.index - last.index >= minBars;
    const enoughMove = Math.abs(pivot.price - last.price) >= minMove;
    if (!enoughBars || !enoughMove) continue;

    out.push(pivot);
  }

  return out;
}

function atr(candles: Array<IndicatorCandle & { time: number }>, period: number): number | null {
  if (candles.length <= period + 1) return null;
  const ranges: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const previous = candles[index - 1];
    ranges.push(
      Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previous.close),
        Math.abs(candle.low - previous.close),
      ),
    );
  }
  const recent = ranges.slice(-period);
  if (!recent.length) return null;
  return recent.reduce((sum, value) => sum + value, 0) / recent.length;
}

function averageRange(candles: Array<IndicatorCandle & { time: number }>): number {
  const recent = candles.slice(-40);
  if (!recent.length) return 0;
  return recent.reduce((sum, candle) => sum + Math.max(0, candle.high - candle.low), 0) / recent.length;
}

/**
 * Build a horizontal volume profile bound to a single OB band. We bin
 * volume by price level using each candle's tickVolume (or volume) and
 * the overlap between the candle's [low, high] and the OB's [bottom,
 * top]. Only candles that traded inside the band contribute. Returns the
 * profile in pixel coordinates so the caller just renders rects.
 */
function buildVolumeProfile(
  candles: Array<IndicatorCandle & { time: number }>,
  bandTop: number,
  bandBottom: number,
  bandTopY: number,
  bandBottomY: number,
): VolumeProfileBar[] {
  const top = Math.max(bandTop, bandBottom);
  const bottom = Math.min(bandTop, bandBottom);
  if (top <= bottom) return [];

  const numBins = 8;
  const bins = new Array(numBins).fill(0) as number[];
  for (const c of candles) {
    const overlapTop = Math.min(top, c.high);
    const overlapBot = Math.max(bottom, c.low);
    if (overlapTop <= overlapBot) continue;
    const candleSpan = c.high - c.low;
    if (candleSpan <= 0) continue;
    const candleVol = (c.tickVolume ?? c.volume ?? 0) > 0 ? Number(c.tickVolume ?? c.volume ?? 0) : 0;
    if (candleVol <= 0) continue;
    const overlapFraction = (overlapTop - overlapBot) / candleSpan;
    const allocated = candleVol * overlapFraction;
    const binSize = (top - bottom) / numBins;
    // Distribute the allocated volume across the bins covered by the
    // overlap range. This is a uniform price distribution within the
    // candle — honest given we don't have intra-bar tick data.
    const overlapSpan = overlapTop - overlapBot;
    if (overlapSpan <= 0 || binSize <= 0) continue;
    for (let i = 0; i < numBins; i += 1) {
      const binTop = top - i * binSize;
      const binBot = top - (i + 1) * binSize;
      const localTop = Math.min(binTop, overlapTop);
      const localBot = Math.max(binBot, overlapBot);
      if (localTop <= localBot) continue;
      const portion = (localTop - localBot) / overlapSpan;
      bins[i] += allocated * portion;
    }
  }

  const maxBin = Math.max(...bins, 0);
  if (maxBin <= 0) return [];

  // bandTopY corresponds to `top`, bandBottomY to `bottom`. Map each bin
  // (top-down) into its pixel slot.
  const totalY = bandBottomY - bandTopY;
  const slot = totalY / numBins;
  return bins.map((value, index) => ({
    y: bandTopY + index * slot,
    height: Math.max(1, slot - 1),
    widthFraction: maxBin === 0 ? 0 : Math.max(0, value / maxBin),
  }));
}

/**
 * Honest LuxAlgo-style volumetric breakdown for an OB band.
 *
 *  buyerVolume  = Σ tickVolume for green-body candles (close > open)
 *                 weighted by the fraction of the candle's range that
 *                 overlaps the OB band.
 *  sellerVolume = same, for red-body candles (close < open).
 *
 * Doji candles (close == open) split 50/50 since neither side took
 * the bar. We deliberately use tickVolume (or volume) as-is rather
 * than synthesising values — if MetaApi doesn't ship volume for a
 * symbol the breakdown returns zeros and the renderer hides the bar.
 */
function buildVolumetricBreakdown(
  candles: Array<IndicatorCandle & { time: number }>,
  bandTop: number,
  bandBottom: number,
): VolumetricBreakdown | undefined {
  const top = Math.max(bandTop, bandBottom);
  const bottom = Math.min(bandTop, bandBottom);
  if (top <= bottom) return undefined;

  let buyerVolume = 0;
  let sellerVolume = 0;
  for (const c of candles) {
    const overlapTop = Math.min(top, c.high);
    const overlapBot = Math.max(bottom, c.low);
    if (overlapTop <= overlapBot) continue;
    const candleSpan = c.high - c.low;
    if (candleSpan <= 0) continue;
    const candleVol = (c.tickVolume ?? c.volume ?? 0) > 0 ? Number(c.tickVolume ?? c.volume ?? 0) : 0;
    if (candleVol <= 0) continue;
    const overlapFraction = (overlapTop - overlapBot) / candleSpan;
    const allocated = candleVol * overlapFraction;
    if (c.close > c.open) {
      buyerVolume += allocated;
    } else if (c.close < c.open) {
      sellerVolume += allocated;
    } else {
      // Doji — split allocated volume evenly so the math still adds up.
      buyerVolume += allocated * 0.5;
      sellerVolume += allocated * 0.5;
    }
  }

  const totalVolume = buyerVolume + sellerVolume;
  if (totalVolume <= 0) return undefined;

  return {
    buyerVolume,
    sellerVolume,
    totalVolume,
    buyerPercent: (buyerVolume / totalVolume) * 100,
    sellerPercent: (sellerVolume / totalVolume) * 100,
  };
}

/**
 * Build inverse fair-value gaps. An IFVG is a 3-bar FVG that has since
 * been fully invaded by a later candle's close — i.e. the imbalance was
 * "reclaimed" and now flips polarity.
 *
 * Render rules:
 *  • Detected portion keeps the original 3-bar FVG box size.
 *  • If still useful (no second mitigation), dashed top/bottom rays
 *    project forward to the future-extension X.
 *  • A 50% midline is drawn so the trader can read the inflection.
 */
function buildInverseFvgs(
  candles: Array<IndicatorCandle & { time: number }>,
  handle: ChartCanvasHandle,
  futureExtensionX: number,
  atr: Array<number>,
  pal: OverlayPalette,
): Zone[] {
  const out: Zone[] = [];
  if (candles.length < 4) return out;
  // LuxAlgo's atr_multi default is 0.25. We keep the same so the
  // filtering pressure matches the reference Pine script exactly.
  const ATR_MULT = 0.25;

  for (let i = 2; i < candles.length; i += 1) {
    const a = candles[i - 2];
    const b = candles[i - 1];
    const c = candles[i];
    const gapThreshold = (atr[i] ?? 0) * ATR_MULT;

    // Bullish FVG (gap up): low[i] > high[i-2] AND close[i-1] > high[i-2].
    // Inverted when a later candle closes back BELOW high[i-2] (the
    // bottom of the gap). After inversion the zone behaves like
    // bearish resistance until price closes BACK above the gap top →
    // "second mitigation" / fully consumed.
    if (c.low > a.high && b.close > a.high) {
      const gapTop = c.low;
      const gapBot = a.high;
      if (Math.abs(gapTop - gapBot) <= gapThreshold) continue;
      let invertedAt: number | null = null;
      let invertedIdx: number | null = null;
      for (let k = i + 1; k < candles.length; k += 1) {
        if (candles[k].close < gapBot) {
          invertedAt = candles[k].time;
          invertedIdx = k;
          break;
        }
      }
      if (invertedAt != null && invertedIdx != null) {
        let secondMitigation = false;
        for (let k = invertedIdx + 1; k < candles.length; k += 1) {
          if (candles[k].close > gapTop) {
            secondMitigation = true;
            break;
          }
        }
        const x1 = handle.timeToCoordinate(a.time);
        const sourceEndX = handle.timeToCoordinate(c.time);
        const invX = handle.timeToCoordinate(invertedAt);
        const yTop = handle.priceToCoordinate(gapTop);
        const yBot = handle.priceToCoordinate(gapBot);
        if (
          x1 != null &&
          sourceEndX != null &&
          invX != null &&
          yTop != null &&
          yBot != null
        ) {
          const detectionEndX = invX;
          out.push({
            x: x1,
            y: Math.min(yTop, yBot),
            width: Math.max(8, detectionEndX - x1),
            height: Math.max(2, Math.abs(yBot - yTop)),
            detectionEndX,
            extendX: Math.max(detectionEndX, futureExtensionX),
            midY: (yTop + yBot) / 2,
            stroke: pal.ifvgBearStroke,
            fill: pal.ifvgBearOrig,
            // Inverted bullish FVG flips polarity → behaves like bearish
            // resistance going forward.
            direction: "down",
            originalDirection: "up",
            inversionX: invX,
            extend: true,
            mitigated: secondMitigation,
          });
        }
      }
    }

    // Bearish FVG (gap down): high[i] < low[i-2] AND close[i-1] < low[i-2].
    // Inverted when a later candle closes back ABOVE low[i-2].
    if (c.high < a.low && b.close < a.low) {
      const gapTop = a.low;
      const gapBot = c.high;
      if (Math.abs(gapTop - gapBot) <= gapThreshold) continue;
      let invertedAt: number | null = null;
      let invertedIdx: number | null = null;
      for (let k = i + 1; k < candles.length; k += 1) {
        if (candles[k].close > gapTop) {
          invertedAt = candles[k].time;
          invertedIdx = k;
          break;
        }
      }
      if (invertedAt != null && invertedIdx != null) {
        let secondMitigation = false;
        for (let k = invertedIdx + 1; k < candles.length; k += 1) {
          if (candles[k].close < gapBot) {
            secondMitigation = true;
            break;
          }
        }
        const x1 = handle.timeToCoordinate(a.time);
        const sourceEndX = handle.timeToCoordinate(c.time);
        const invX = handle.timeToCoordinate(invertedAt);
        const yTop = handle.priceToCoordinate(gapTop);
        const yBot = handle.priceToCoordinate(gapBot);
        if (
          x1 != null &&
          sourceEndX != null &&
          invX != null &&
          yTop != null &&
          yBot != null
        ) {
          const detectionEndX = invX;
          out.push({
            x: x1,
            y: Math.min(yTop, yBot),
            width: Math.max(8, detectionEndX - x1),
            height: Math.max(2, Math.abs(yBot - yTop)),
            detectionEndX,
            extendX: Math.max(detectionEndX, futureExtensionX),
            midY: (yTop + yBot) / 2,
            stroke: pal.ifvgBullStroke,
            fill: pal.ifvgBullOrig,
            // Inverted bearish FVG → flips to bullish support.
            direction: "up",
            originalDirection: "down",
            inversionX: invX,
            extend: true,
            mitigated: secondMitigation,
          });
        }
      }
    }
  }

  // Return all detected iFVGs; the consumer applies the per-direction
  // count picker (latest N up + N down). Each zone already has the
  // correct extend / mitigated flags so unmitigated ones bleed forward
  // and reclaimed ones stop at detectionEndX.
  return out;
}

/**
 * Compute previous trading day's high/low. We bucket candles by UTC date and
 * pick the bucket immediately before the current one.
 */
function buildPreviousDayLevels(
  candles: Array<IndicatorCandle & { time: number }>,
  handle: ChartCanvasHandle,
): {
  high: { y: number; price: number } | null;
  low: { y: number; price: number } | null;
  eq: { y: number; price: number } | null;
} {
  if (candles.length === 0) return { high: null, low: null, eq: null };

  const buckets = new Map<string, { high: number; low: number }>();
  const order: string[] = [];
  for (const candle of candles) {
    const key = utcDateKey(candle.time);
    const existing = buckets.get(key);
    if (existing) {
      existing.high = Math.max(existing.high, candle.high);
      existing.low = Math.min(existing.low, candle.low);
    } else {
      buckets.set(key, { high: candle.high, low: candle.low });
      order.push(key);
    }
  }

  if (order.length < 2) return { high: null, low: null, eq: null };

  const previousKey = order[order.length - 2];
  const previous = buckets.get(previousKey);
  if (!previous) return { high: null, low: null, eq: null };

  const yHigh = handle.priceToCoordinate(previous.high);
  const yLow = handle.priceToCoordinate(previous.low);
  // Previous Day Equilibrium = midpoint of yesterday's H + L. Stable
  // level since it's locked once yesterday closes — the trader can use
  // it as a "fair price for yesterday's session" reference today.
  const eqPrice = (previous.high + previous.low) / 2;
  const yEq = handle.priceToCoordinate(eqPrice);

  return {
    high: yHigh == null ? null : { y: yHigh, price: previous.high },
    low: yLow == null ? null : { y: yLow, price: previous.low },
    eq: yEq == null ? null : { y: yEq, price: eqPrice },
  };
}

function utcDateKey(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}
