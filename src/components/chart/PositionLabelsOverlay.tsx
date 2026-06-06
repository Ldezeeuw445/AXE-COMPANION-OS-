"use client";

/**
 * PositionLabelsOverlay — renders entry / SL / TP labels on the LEFT side
 * of the chart as floating text (no box). Positioned by polling
 * priceToCoordinate() from the chart canvas ref so labels track
 * pan/zoom in real time.
 */

import { useEffect, useState, type RefObject } from "react";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";
import type { ChartOverlayRow } from "@/lib/broker/loadChartPageData";
import { CHART_THEME } from "@/components/chart/chartTheme";
import {
  priceDigitsForSymbol,
  pointValueForSymbol,
} from "@/lib/broker/symbolFormat";

interface LabelItem {
  key: string;
  y: number;
  text: string;
  color: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatPnl(profit: number | null | undefined): string {
  if (profit == null) return "";
  const sign = profit >= 0 ? "+" : "";
  return `${sign}${profit.toFixed(2)} USD`;
}

function slTpPnl(
  entryPrice: number | null | undefined,
  levelPrice: number,
  volume: number,
  side: "buy" | "sell",
  symbol: string,
): string {
  if (entryPrice == null || entryPrice <= 0) return "";
  const digits = priceDigitsForSymbol(symbol);
  const pointSize = Math.pow(10, -digits);
  const dist = levelPrice - entryPrice;
  const pointsRaw = Math.round(dist / pointSize);
  const signedPoints = side === "buy" ? pointsRaw : -pointsRaw;
  const pv = pointValueForSymbol(symbol);
  const usd = signedPoints * volume * pv;
  const sign = usd < 0 ? "-" : "";
  const abs = Math.abs(usd);
  const [intPart, decPart] = abs.toFixed(2).split(".");
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${withSpaces}.${decPart} USD`;
}

function entryColor(side: string | null): string {
  if (side === "sell") return CHART_THEME.negativeText;
  if (side === "buy") return CHART_THEME.positiveText;
  return CHART_THEME.entryLine;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PositionLabelsOverlay({
  canvasRef,
  overlays,
  symbol,
}: {
  canvasRef: RefObject<ChartCanvasHandle | null>;
  overlays: ChartOverlayRow[];
  symbol: string;
}) {
  const [labels, setLabels] = useState<LabelItem[]>([]);

  useEffect(() => {
    if (overlays.length === 0) {
      setLabels([]);
      return;
    }

    let raf: number;
    let mounted = true;

    const update = () => {
      if (!mounted) return;
      const canvas = canvasRef.current;
      if (!canvas) {
        raf = requestAnimationFrame(update);
        return;
      }

      const next: LabelItem[] = [];

      for (const o of overlays) {
        const side = o.side as "buy" | "sell" | null;

        // Entry label
        if (o.entryPrice != null && o.entryPrice > 0) {
          const y = canvas.priceToCoordinate(o.entryPrice);
          if (y != null) {
            const sideLabel = side?.toUpperCase() ?? "TRADE";
            const pnl = o.profit != null ? `, ${formatPnl(o.profit)}` : "";
            next.push({
              key: `entry-${o.id}`,
              y,
              text: `${sideLabel} ${o.volume}${pnl}`,
              color: entryColor(side),
            });
          }
        }

        // SL label
        if (o.stopLoss != null && o.stopLoss > 0) {
          const y = canvas.priceToCoordinate(o.stopLoss);
          if (y != null) {
            const pnl = slTpPnl(
              o.entryPrice, o.stopLoss, o.volume,
              side as "buy" | "sell", symbol,
            );
            next.push({
              key: `sl-${o.id}`,
              y,
              text: `SL${pnl ? `, ${pnl}` : ""}`,
              color: CHART_THEME.stopLine,
            });
          }
        }

        // TP label
        if (o.takeProfit != null && o.takeProfit > 0) {
          const y = canvas.priceToCoordinate(o.takeProfit);
          if (y != null) {
            const pnl = slTpPnl(
              o.entryPrice, o.takeProfit, o.volume,
              side as "buy" | "sell", symbol,
            );
            next.push({
              key: `tp-${o.id}`,
              y,
              text: `TP${pnl ? `, ${pnl}` : ""}`,
              color: CHART_THEME.takeLine,
            });
          }
        }
      }

      setLabels(next);
      raf = requestAnimationFrame(update);
    };

    raf = requestAnimationFrame(update);
    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
    };
  }, [canvasRef, overlays, symbol]);

  if (labels.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {labels.map((label) => (
        <div
          key={label.key}
          className="absolute left-1.5 -translate-y-1/2 whitespace-nowrap"
          style={{
            top: label.y,
            color: label.color,
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.02em",
            textShadow:
              "0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.8)",
          }}
        >
          {label.text}
        </div>
      ))}
    </div>
  );
}
