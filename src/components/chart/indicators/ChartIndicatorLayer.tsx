"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";

/**
 * Shared right-rail offset. Every chart label that lives on the right
 * (PDH, PDL, PDQ, OB volume, fib %, fib price, Premium / Discount) sits
 * at `containerWidth - RIGHT_RAIL_OFFSET` so the entire right column
 * lines up vertically with no overlap. Mirrors `RIGHT_RAIL_OFFSET` in
 * `FibAnnotationLayer.tsx`.
 */
const RIGHT_RAIL_OFFSET = 8;

type Props = {
  candles: MetaApiCandle[];
  canvasRef: React.RefObject<ChartCanvasHandle | null>;
  active: {
    ma?: boolean;
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

export function ChartIndicatorLayer({
  candles,
  canvasRef,
  active,
  orderBlockCount = 1,
  inverseFvgCount = 1,
  fvgCount = 1,
  projectionCount = 1,
  futureProjectionX = null,
}: Props) {
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

    const ma = sma(visible.map((candle) => candle.close), 20);
    const maPoints: Point[] = visible
      .map((candle, index) => {
        if (ma[index] == null || candle.time == null) return null;
        const x = handle.timeToCoordinate(candle.time);
        const y = handle.priceToCoordinate(ma[index]);
        if (x == null || y == null) return null;
        return { x, y };
      })
      .filter(Boolean) as Point[];

    const structureOverlay = buildStructureOverlay(visible, handle, futureExtensionX);
    const inverseFairValueGaps = buildInverseFvgs(visibleWithTime, handle, size.w, futureExtensionX);
    const { high: previousDayHigh, low: previousDayLow, eq: previousDayEq } =
      buildPreviousDayLevels(visibleWithTime, handle);
    const swingPointLevels = buildSwingPointLevels(visibleWithTime, handle, futureExtensionX);
    // Total tickVolume across the visible window — used as the
    // denominator for OB volume-percent labels ("1.082K (13%)").
    // Considers the last 200 bars to keep the % responsive on long
    // history charts. Falls back to plain `volume` when tickVolume
    // isn't reported.
    const totalChartVolume = visibleWithTime
      .slice(-200)
      .reduce((sum, c) => sum + (Number(c.tickVolume ?? c.volume ?? 0) || 0), 0);

    return {
      maPath: toPath(maPoints),
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
      totalChartVolume,
    };
  }, [candles, canvasRef, size.h, size.w, version, futureProjectionX, orderBlockCount, inverseFvgCount, fvgCount, projectionCount]);

  const defsId = "lux-indicator-defs";

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-[22]" aria-hidden>
      <svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} className="absolute inset-0">
        <defs>
          {/* Gradient fills for premium zone rendering */}
          <linearGradient id={`${defsId}-ob-bull`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(8,153,129,0.28)" />
            <stop offset="100%" stopColor="rgba(8,153,129,0.06)" />
          </linearGradient>
          <linearGradient id={`${defsId}-ob-bear`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(242,54,69,0.28)" />
            <stop offset="100%" stopColor="rgba(242,54,69,0.06)" />
          </linearGradient>
          <linearGradient id={`${defsId}-fvg-bull`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(8,153,129,0.22)" />
            <stop offset="100%" stopColor="rgba(8,153,129,0.04)" />
          </linearGradient>
          <linearGradient id={`${defsId}-fvg-bear`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(242,54,69,0.22)" />
            <stop offset="100%" stopColor="rgba(242,54,69,0.04)" />
          </linearGradient>
          <linearGradient id={`${defsId}-ifvg-bull`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(8,153,129,0.18)" />
            <stop offset="100%" stopColor="rgba(8,153,129,0.03)" />
          </linearGradient>
          <linearGradient id={`${defsId}-ifvg-bear`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(242,54,69,0.18)" />
            <stop offset="100%" stopColor="rgba(242,54,69,0.03)" />
          </linearGradient>
          {/* Glow filter for structure labels */}
          <filter id={`${defsId}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {active.orderBlocks
          ? geometry.orderBlocks.map((zone, index) => (
              <g key={`ob-${index}`}>
                <PremiumZoneBox zone={zone} variant="ob" defsId={defsId} />
                <PremiumVolumetricLabel
                  zone={zone}
                  containerWidth={size.w}
                  totalChartVolume={geometry.totalChartVolume}
                />
              </g>
            ))
          : null}

        {active.fvg
          ? geometry.fairValueGaps.map((zone, index) => (
              <PremiumZoneBox key={`fvg-${index}`} zone={zone} variant="fvg" defsId={defsId} />
            ))
          : null}

        {active.ifvg
          ? geometry.inverseFairValueGaps.map((zone, index) => (
              <PremiumZoneBox key={`ifvg-${index}`} zone={zone} variant="ifvg" defsId={defsId} />
            ))
          : null}

        {/* Previous Day High / Low / Equilibrium — LuxAlgo PWH/PWL style
            with dotted lines + right-rail pill badges. */}
        {active.pdh && geometry.previousDayHigh ? (
          <PremiumLevelLine
            y={geometry.previousDayHigh.y}
            label="PDH"
            color="rgba(8,153,129,0.9)"
            labelColor="rgba(8,153,129,1)"
            pillBg="rgba(8,153,129,0.15)"
            containerWidth={size.w}
          />
        ) : null}

        {active.pdl && geometry.previousDayLow ? (
          <PremiumLevelLine
            y={geometry.previousDayLow.y}
            label="PDL"
            color="rgba(242,54,69,0.9)"
            labelColor="rgba(242,54,69,1)"
            pillBg="rgba(242,54,69,0.15)"
            containerWidth={size.w}
          />
        ) : null}

        {active.pdq && geometry.previousDayEq ? (
          <PremiumLevelLine
            y={geometry.previousDayEq.y}
            label="PDQ"
            color="rgba(120,150,200,0.7)"
            labelColor="rgba(160,185,230,0.95)"
            pillBg="rgba(120,150,200,0.12)"
            containerWidth={size.w}
          />
        ) : null}

        {active.swingPoints
          ? geometry.swingPointLevels.map((level, index) => {
              const isHigh = level.kind === "high";
              const lineColor = isHigh ? "rgba(242,54,69,0.45)" : "rgba(8,153,129,0.45)";
              const dotColor = isHigh ? "rgba(242,54,69,0.9)" : "rgba(8,153,129,0.9)";
              const labelColor = isHigh ? "rgba(242,54,69,1)" : "rgba(8,153,129,1)";
              return (
                <g key={`swing-${level.kind}-${index}`}>
                  <line
                    x1={level.x1}
                    x2={level.x2}
                    y1={level.y}
                    y2={level.y}
                    stroke={lineColor}
                    strokeWidth={0.8}
                    strokeDasharray="3 6"
                    strokeLinecap="round"
                  />
                  <circle cx={level.x1} cy={level.y} r={2} fill={dotColor} />
                  <circle cx={level.x1} cy={level.y} r={4} fill="none" stroke={dotColor} strokeWidth={0.5} opacity={0.5} />
                  <text
                    x={Math.max(6, level.x1 - 4)}
                    y={level.y + (isHigh ? -8 : 14)}
                    textAnchor="end"
                    fontFamily="'Inter', 'SF Pro Text', -apple-system, system-ui, sans-serif"
                    fontSize="8.5"
                    fontWeight="600"
                    letterSpacing="0.04em"
                    fill={labelColor}
                    stroke="rgba(0,0,0,0.85)"
                    strokeWidth="2.4"
                    paintOrder="stroke"
                  >
                    {level.label}
                  </text>
                </g>
              );
            })
          : null}

        {active.structure
          ? geometry.structureLines.map((item, index) => (
              <PremiumStructureLine key={`line-${item.label}-${index}`} item={item} defsId={defsId} />
            ))
          : null}

        {active.ma && geometry.maPath ? (
          <path d={geometry.maPath} fill="none" stroke="rgba(96,165,250,0.72)" strokeWidth={1.3} strokeLinecap="round" />
        ) : null}

        {active.structure
          ? geometry.structureLabels.map((item, index) => (
              <PremiumSwingLabel key={`${item.label}-${index}`} item={item} />
            ))
          : null}

        {active.structure
          ? geometry.swingFailures.map((item, index) => (
              <PremiumSfpMarker key={`sfp-${index}`} item={item} />
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
function formatVolume(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}K`;
  return `${Math.round(n)}`;
}

/**
 * Premium volumetric label — frosted pill badge on the right rail.
 * Shows volume + % of chart + buyer/seller split in a refined layout.
 */
function PremiumVolumetricLabel({
  zone,
  containerWidth,
  totalChartVolume,
}: {
  zone: Zone;
  containerWidth: number;
  totalChartVolume: number;
}) {
  const v = zone.volumetric;
  if (!v || v.totalVolume <= 0) return null;
  if (zone.height < 14) return null;

  const railX = containerWidth - RIGHT_RAIL_OFFSET;
  const volPctOfChart =
    totalChartVolume > 0
      ? Math.max(0, (v.totalVolume / totalChartVolume) * 100)
      : 0;
  const volLabel = `${formatVolume(v.totalVolume)} (${volPctOfChart.toFixed(2)}%)`;
  const isBull = zone.direction === "up";
  const baseColor = isBull ? "rgba(8,153,129,0.95)" : "rgba(242,54,69,0.95)";
  const pillBg = isBull ? "rgba(8,153,129,0.12)" : "rgba(242,54,69,0.12)";
  const pillW = volLabel.length * 5.8 + 16;
  const pillH = 18;

  return (
    <g pointerEvents="none">
      <line
        x1={zone.detectionEndX}
        x2={railX - pillW - 4}
        y1={zone.midY}
        y2={zone.midY}
        stroke={baseColor}
        strokeWidth={0.6}
        strokeDasharray="2 4"
        opacity={0.6}
      />
      <rect
        x={railX - pillW}
        y={zone.midY - pillH / 2}
        width={pillW}
        height={pillH}
        rx={3}
        fill={pillBg}
        stroke={baseColor}
        strokeWidth={0.5}
        opacity={0.9}
      />
      <text
        x={railX - pillW / 2}
        y={zone.midY + 3.5}
        textAnchor="middle"
        fontFamily="'Inter', 'SF Pro Text', -apple-system, system-ui, sans-serif"
        fontSize="9"
        fontWeight="600"
        letterSpacing="0.03em"
        fill={baseColor}
      >
        {volLabel}
      </text>
    </g>
  );
}

/**
 * Premium volumetric split — refined with subtle opacity and a thin
 * equilibrium line.
 */
function PremiumVolumetricSplit({ zone }: { zone: Zone }) {
  const v = zone.volumetric;
  if (!v || v.totalVolume <= 0) return null;
  const sellerH = zone.height * (v.sellerPercent / 100);
  const buyerH = zone.height - sellerH;
  const w = Math.max(2, zone.detectionEndX - zone.x);
  return (
    <g pointerEvents="none">
      {sellerH > 0 ? (
        <rect x={zone.x} y={zone.y} width={w} height={sellerH} fill="rgba(242,54,69,0.14)" />
      ) : null}
      {buyerH > 0 ? (
        <rect x={zone.x} y={zone.y + sellerH} width={w} height={buyerH} fill="rgba(8,153,129,0.14)" />
      ) : null}
      <line
        x1={zone.x}
        x2={zone.detectionEndX}
        y1={zone.y + sellerH}
        y2={zone.y + sellerH}
        stroke="rgba(255,255,255,0.25)"
        strokeWidth={0.5}
        strokeDasharray="1.5 2.5"
      />
    </g>
  );
}

/**
 * Premium zone renderer — LuxAlgo Price Action Concepts style.
 *
 * Key differences from the basic version:
 * - Gradient fills that fade rightward (solid → transparent)
 * - No rounded corners — sharp edges like LuxAlgo
 * - Thinner, more refined border strokes
 * - Top/bottom extension lines with subtle opacity
 * - Midline dashes are finer
 * - Zone labels use pill badges
 */
function PremiumZoneBox({
  zone,
  variant,
  defsId,
}: {
  zone: Zone;
  variant: "ob" | "fvg" | "ifvg";
  defsId: string;
}) {
  const fadeFactor = zone.mitigated ? 0.35 : 1;
  const detectionWidth = Math.max(0, zone.detectionEndX - zone.x);
  const detectionEndX = zone.x + detectionWidth;
  const extensionStartX = detectionEndX;
  const extensionWidth = Math.max(0, zone.extendX - extensionStartX);
  const isBull = zone.direction === "up";
  const edgeColor = isBull ? "rgba(8,153,129,0.55)" : "rgba(242,54,69,0.55)";
  const edgeColorStrong = isBull ? "rgba(8,153,129,0.75)" : "rgba(242,54,69,0.75)";

  const gradientId =
    variant === "ob"
      ? isBull ? `${defsId}-ob-bull` : `${defsId}-ob-bear`
      : variant === "fvg"
        ? isBull ? `${defsId}-fvg-bull` : `${defsId}-fvg-bear`
        : isBull ? `${defsId}-ifvg-bull` : `${defsId}-ifvg-bear`;

  if (variant === "ob") {
    return (
      <g opacity={fadeFactor}>
        <rect
          x={zone.x}
          y={zone.y}
          width={Math.max(2, detectionWidth)}
          height={zone.height}
          fill={`url(#${gradientId})`}
        />
        {/* Left edge accent bar — LuxAlgo style */}
        <line
          x1={zone.x}
          x2={zone.x}
          y1={zone.y}
          y2={zone.y + zone.height}
          stroke={edgeColorStrong}
          strokeWidth={2}
        />
        {/* Top edge */}
        <line
          x1={zone.x}
          x2={detectionEndX}
          y1={zone.y}
          y2={zone.y}
          stroke={edgeColor}
          strokeWidth={0.6}
        />
        {/* Bottom edge */}
        <line
          x1={zone.x}
          x2={detectionEndX}
          y1={zone.y + zone.height}
          y2={zone.y + zone.height}
          stroke={edgeColor}
          strokeWidth={0.6}
        />
        {zone.volumetric && zone.volumetric.totalVolume > 0 ? (
          <PremiumVolumetricSplit zone={zone} />
        ) : null}
        {zone.extend && extensionWidth > 1 ? (
          <>
            <line
              x1={extensionStartX}
              x2={zone.extendX}
              y1={zone.y}
              y2={zone.y}
              stroke={edgeColor}
              strokeWidth={0.6}
              strokeDasharray="4 5"
            />
            <line
              x1={extensionStartX}
              x2={zone.extendX}
              y1={zone.y + zone.height}
              y2={zone.y + zone.height}
              stroke={edgeColor}
              strokeWidth={0.6}
              strokeDasharray="4 5"
            />
          </>
        ) : null}
      </g>
    );
  }

  const labelText = variant === "ifvg" ? "iFVG" : "FVG";
  const labelBg = isBull ? "rgba(8,153,129,0.18)" : "rgba(242,54,69,0.18)";
  const labelFill = isBull ? "rgba(8,153,129,0.95)" : "rgba(242,54,69,0.95)";

  return (
    <g opacity={fadeFactor}>
      <rect
        x={zone.x}
        y={zone.y}
        width={Math.max(2, detectionWidth)}
        height={zone.height}
        fill={`url(#${gradientId})`}
      />
      {/* Left accent bar */}
      <line
        x1={zone.x}
        x2={zone.x}
        y1={zone.y}
        y2={zone.y + zone.height}
        stroke={edgeColorStrong}
        strokeWidth={variant === "ifvg" ? 1.5 : 1.8}
        strokeDasharray={variant === "ifvg" ? "3 3" : undefined}
      />
      {/* Extension fill (faded) */}
      {zone.extend && extensionWidth > 1 ? (
        <rect
          x={extensionStartX}
          y={zone.y}
          width={extensionWidth}
          height={zone.height}
          fill={isBull ? "rgba(8,153,129,0.06)" : "rgba(242,54,69,0.06)"}
        />
      ) : null}
      {/* Midline */}
      <line
        x1={zone.x}
        x2={zone.extendX}
        y1={zone.midY}
        y2={zone.midY}
        stroke={edgeColor}
        strokeWidth={0.5}
        strokeDasharray="2 4"
      />
      {/* Top/bottom extension lines */}
      {zone.extend && extensionWidth > 1 ? (
        <>
          <line
            x1={extensionStartX}
            x2={zone.extendX}
            y1={zone.y}
            y2={zone.y}
            stroke={edgeColor}
            strokeWidth={0.5}
            strokeDasharray="3 5"
          />
          <line
            x1={extensionStartX}
            x2={zone.extendX}
            y1={zone.y + zone.height}
            y2={zone.y + zone.height}
            stroke={edgeColor}
            strokeWidth={0.5}
            strokeDasharray="3 5"
          />
        </>
      ) : null}
      {/* Label pill badge */}
      {zone.height >= 14 ? (
        <g>
          <rect
            x={zone.x + 4}
            y={zone.y + 3}
            width={labelText.length * 6 + 8}
            height={14}
            rx={2}
            fill={labelBg}
            stroke={edgeColor}
            strokeWidth={0.4}
          />
          <text
            x={zone.x + 4 + (labelText.length * 6 + 8) / 2}
            y={zone.y + 13}
            textAnchor="middle"
            fontFamily="'Inter', 'SF Pro Text', -apple-system, system-ui, sans-serif"
            fontSize="8"
            fontWeight="600"
            letterSpacing="0.06em"
            fill={labelFill}
          >
            {labelText}
          </text>
        </g>
      ) : null}
    </g>
  );
}

/**
 * Premium level line — PDH/PDL/PDQ rendered with a right-rail pill badge,
 * matching LuxAlgo PWH/PWL visual language.
 */
function PremiumLevelLine({
  y,
  label,
  color,
  labelColor,
  pillBg,
  containerWidth,
}: {
  y: number;
  label: string;
  color: string;
  labelColor: string;
  pillBg: string;
  containerWidth: number;
}) {
  const railX = containerWidth - RIGHT_RAIL_OFFSET;
  const pillW = label.length * 7 + 12;
  const pillH = 16;
  return (
    <g>
      <line
        x1={0}
        x2={railX - pillW - 6}
        y1={y}
        y2={y}
        stroke={color}
        strokeWidth={0.7}
        strokeDasharray="6 4"
        strokeLinecap="round"
      />
      <rect
        x={railX - pillW}
        y={y - pillH / 2}
        width={pillW}
        height={pillH}
        rx={3}
        fill={pillBg}
        stroke={color}
        strokeWidth={0.5}
      />
      <text
        x={railX - pillW / 2}
        y={y + 3.5}
        textAnchor="middle"
        fontFamily="'Inter', 'SF Pro Text', -apple-system, system-ui, sans-serif"
        fontSize="9"
        fontWeight="700"
        letterSpacing="0.08em"
        fill={labelColor}
      >
        {label}
      </text>
    </g>
  );
}

/**
 * Premium structure line with label badge — BOS uses a dashed line,
 * CHoCH+/MSS uses a solid line. Both get a small colored pill label
 * at the endpoint, matching LuxAlgo Price Action Concepts exactly.
 */
function PremiumStructureLine({
  item,
  defsId,
}: {
  item: StructureLine;
  defsId: string;
}) {
  const bullColor = "rgba(8,153,129,0.9)";
  const bearColor = "rgba(242,54,69,0.9)";
  const lineColor = item.bullish ? bullColor : bearColor;
  const labelBg = item.bullish ? "rgba(8,153,129,0.15)" : "rgba(242,54,69,0.15)";
  const labelText = item.continuation ? "BOS" : "CHoCH+";
  const pillW = labelText.length * 6.5 + 10;
  const pillH = 15;
  const labelX = item.x1 + (item.x2 - item.x1) / 2;

  return (
    <g>
      <line
        x1={item.x1}
        x2={item.x2}
        y1={item.y}
        y2={item.y}
        stroke={lineColor}
        strokeWidth={item.continuation ? 0.8 : 1.2}
        strokeDasharray={item.continuation ? "5 5" : "3 3"}
      />
      {/* Label pill at the midpoint of the line */}
      <rect
        x={labelX - pillW / 2}
        y={item.y - pillH - 3}
        width={pillW}
        height={pillH}
        rx={2.5}
        fill={labelBg}
        stroke={lineColor}
        strokeWidth={0.5}
      />
      <text
        x={labelX}
        y={item.y - pillH / 2 + 1}
        textAnchor="middle"
        fontFamily="'Inter', 'SF Pro Text', -apple-system, system-ui, sans-serif"
        fontSize="8.5"
        fontWeight="600"
        letterSpacing="0.04em"
        fill={lineColor}
      >
        {labelText}
      </text>
    </g>
  );
}

/**
 * Premium swing label (HH/HL/LH/LL) — small refined text positioned
 * above highs and below lows, using the LuxAlgo color scheme.
 */
function PremiumSwingLabel({ item }: { item: StructureLabel }) {
  const isHigh = item.kind === "high";
  const fill = isHigh ? "rgba(8,153,129,0.92)" : "rgba(242,54,69,0.92)";
  return (
    <text
      x={item.x}
      y={item.y}
      textAnchor="middle"
      fontFamily="'Inter', 'SF Pro Text', -apple-system, system-ui, sans-serif"
      fontSize="9"
      fontWeight="600"
      letterSpacing="0.03em"
      fill={fill}
      stroke="rgba(0,0,0,0.8)"
      strokeWidth="2.5"
      paintOrder="stroke"
    >
      {item.label}
    </text>
  );
}

/**
 * Premium SFP marker — subtle diamond shape instead of raw text.
 */
function PremiumSfpMarker({ item }: { item: StructureArrow }) {
  const fill = item.bullish ? "rgba(8,153,129,0.95)" : "rgba(242,54,69,0.95)";
  const bg = item.bullish ? "rgba(8,153,129,0.15)" : "rgba(242,54,69,0.15)";
  const pillW = 28;
  const pillH = 14;
  return (
    <g>
      <rect
        x={item.x - pillW / 2}
        y={item.y - pillH / 2}
        width={pillW}
        height={pillH}
        rx={2}
        fill={bg}
        stroke={fill}
        strokeWidth={0.5}
      />
      <text
        x={item.x}
        y={item.y + 3.5}
        textAnchor="middle"
        fontFamily="'Inter', 'SF Pro Text', -apple-system, system-ui, sans-serif"
        fontSize="8"
        fontWeight="700"
        letterSpacing="0.08em"
        fill={fill}
      >
        SFP
      </text>
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
      const x = handle.timeToCoordinate(previous.time);
      const x2 = handle.timeToCoordinate(visible[Math.min(index + 5, visible.length - 1)].time);
      const topY = handle.priceToCoordinate(top);
      const bottomY = handle.priceToCoordinate(bottom);
      if (x != null && x2 != null && topY != null && bottomY != null && Math.abs(bottomY - topY) > 1) {
        const isBullishOb = candle.close > candle.open && previous.close < previous.open;
        const isBearishOb = candle.close < candle.open && previous.close > previous.open;
        if (isBullishOb || isBearishOb) {
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
          const profile = mitigated ? undefined : buildVolumeProfile(visible, top, bottom, topY, bottomY);
          const volumetric = mitigated ? undefined : buildVolumetricBreakdown(visible, top, bottom);

          orderBlocks.push({
            x,
            y: Math.min(topY, bottomY),
            width: baseWidth,
            height: Math.max(2, Math.abs(bottomY - topY)),
            extendX: mitigated ? detectionEndX : Math.max(detectionEndX, futureExtensionX),
            detectionEndX,
            midY: (topY + bottomY) / 2,
            stroke: isBullishOb ? "rgba(8,153,129,0.65)" : "rgba(242,54,69,0.65)",
            fill: isBullishOb ? "rgba(8,153,129,0.18)" : "rgba(242,54,69,0.18)",
            direction: isBullishOb ? "up" : "down",
            extend: !mitigated,
            mitigated,
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
      if (x != null && x2 != null) {
        if (candle.low > twoBack.high) {
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
              stroke: "rgba(8,153,129,0.78)",
              fill: "rgba(8,153,129,0.18)",
              direction: "up",
              extend: !mitigated,
              mitigated,
            });
          }
        } else if (candle.high < twoBack.low) {
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
              stroke: "rgba(242,54,69,0.78)",
              fill: "rgba(242,54,69,0.16)",
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
 *  • Detected portion (gap → inversion candle) keeps the dashed border.
 *  • If still useful (no second mitigation), the inner colour bleeds
 *    forward to the future-extension X with no border.
 *  • A 50% midline is drawn so the trader can read the inflection.
 */
function buildInverseFvgs(
  candles: Array<IndicatorCandle & { time: number }>,
  handle: ChartCanvasHandle,
  chartWidth: number,
  futureExtensionX: number,
): Zone[] {
  const out: Zone[] = [];
  if (candles.length < 4) return out;

  for (let i = 2; i < candles.length; i += 1) {
    const a = candles[i - 2];
    const c = candles[i];

    // Bullish FVG (gap up): c.low > a.high. Inverted when a later candle
    // closes back BELOW a.high (the bottom of the gap). After inversion
    // the zone behaves like resistance until price closes BACK above the
    // gap top → "second mitigation" / fully consumed.
    if (c.low > a.high) {
      const gapTop = c.low;
      const gapBot = a.high;
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
        const x2 = handle.timeToCoordinate(invertedAt);
        const yTop = handle.priceToCoordinate(gapTop);
        const yBot = handle.priceToCoordinate(gapBot);
        if (x1 != null && yTop != null && yBot != null) {
          const detectionEndX = x2 ?? chartWidth - 4;
          out.push({
            x: x1,
            y: Math.min(yTop, yBot),
            width: Math.max(8, detectionEndX - x1),
            height: Math.max(2, Math.abs(yBot - yTop)),
            detectionEndX,
            extendX: secondMitigation ? detectionEndX : Math.max(detectionEndX, futureExtensionX),
            midY: (yTop + yBot) / 2,
            stroke: "rgba(242,54,69,0.85)",
            fill: "rgba(242,54,69,0.16)",
            direction: "down",
            extend: !secondMitigation,
            mitigated: secondMitigation,
          });
        }
      }
    }

    // Bearish FVG (gap down): c.high < a.low. Inverted when a later
    // candle closes back ABOVE a.low.
    if (c.high < a.low) {
      const gapTop = a.low;
      const gapBot = c.high;
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
        const x2 = handle.timeToCoordinate(invertedAt);
        const yTop = handle.priceToCoordinate(gapTop);
        const yBot = handle.priceToCoordinate(gapBot);
        if (x1 != null && yTop != null && yBot != null) {
          const detectionEndX = x2 ?? chartWidth - 4;
          out.push({
            x: x1,
            y: Math.min(yTop, yBot),
            width: Math.max(8, detectionEndX - x1),
            height: Math.max(2, Math.abs(yBot - yTop)),
            detectionEndX,
            extendX: secondMitigation ? detectionEndX : Math.max(detectionEndX, futureExtensionX),
            midY: (yTop + yBot) / 2,
            stroke: "rgba(8,153,129,0.85)",
            fill: "rgba(8,153,129,0.16)",
            direction: "up",
            extend: !secondMitigation,
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
